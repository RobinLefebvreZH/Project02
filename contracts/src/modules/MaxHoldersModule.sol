// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643/compliance/modular/modules/AbstractModuleUpgradeable.sol";
import "@erc3643/compliance/modular/IModularCompliance.sol";
import "@erc3643/token/IToken.sol";

/// @title MaxHoldersModule
/// @notice ERC-3643 compliance module capping the number of distinct investors holding a token.
/// @dev Holders are counted per ONCHAINID, not per wallet, so an investor with several wallets counts once
///      (the relevant unit for thresholds such as BankO Art. 6 "more than 20 lenders" or a 19-holder policy).
///      Must be bound while total supply is zero so the count starts from an accurate state.
contract MaxHoldersModule is AbstractModuleUpgradeable {
    /// compliance => maximum number of holders (0 = no limit)
    mapping(address => uint256) private _maxHolders;
    /// compliance => current number of identities with a non-zero balance
    mapping(address => uint256) private _holderCount;
    /// compliance => identity => aggregated balance
    mapping(address => mapping(address => uint256)) private _idBalance;

    event MaxHoldersSet(address indexed compliance, uint256 maxHolders);

    error IdentityNotFound(address wallet);

    function initialize() external initializer {
        __AbstractModule_init();
    }

    /// @notice Set the holder cap for the calling compliance. Can be lowered below the current count,
    ///         which then only blocks new holders.
    function setMaxHolders(uint256 max) external onlyComplianceCall {
        _maxHolders[msg.sender] = max;
        emit MaxHoldersSet(msg.sender, max);
    }

    function moduleTransferAction(address from, address to, uint256 value) external override onlyComplianceCall {
        address fromId = _identityOf(msg.sender, from);
        address toId = _identityOf(msg.sender, to);
        if (fromId == toId) return;
        _decrease(msg.sender, fromId, value);
        _increase(msg.sender, toId, value);
    }

    function moduleMintAction(address to, uint256 value) external override onlyComplianceCall {
        _increase(msg.sender, _identityOf(msg.sender, to), value);
    }

    function moduleBurnAction(address from, uint256 value) external override onlyComplianceCall {
        _decrease(msg.sender, _identityOf(msg.sender, from), value);
    }

    function moduleCheck(address from, address to, uint256, /*value*/ address compliance)
        external
        view
        override
        returns (bool)
    {
        uint256 max = _maxHolders[compliance];
        if (max == 0) return true;
        address toId = _identityOf(compliance, to);
        if (_idBalance[compliance][toId] > 0) return true; // already a holder
        if (from != address(0) && _identityOf(compliance, from) == toId) return true;
        return _holderCount[compliance] < max;
    }

    function canComplianceBind(address compliance) external view override returns (bool) {
        return IToken(IModularCompliance(compliance).getTokenBound()).totalSupply() == 0;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return false;
    }

    function name() public pure override returns (string memory) {
        return "MaxHoldersModule";
    }

    function getMaxHolders(address compliance) external view returns (uint256) {
        return _maxHolders[compliance];
    }

    function getHolderCount(address compliance) external view returns (uint256) {
        return _holderCount[compliance];
    }

    function getIDBalance(address compliance, address identity) external view returns (uint256) {
        return _idBalance[compliance][identity];
    }

    function _increase(address compliance, address id, uint256 value) private {
        if (value == 0) return;
        if (_idBalance[compliance][id] == 0) _holderCount[compliance] += 1;
        _idBalance[compliance][id] += value;
    }

    function _decrease(address compliance, address id, uint256 value) private {
        if (value == 0) return;
        _idBalance[compliance][id] -= value;
        if (_idBalance[compliance][id] == 0) _holderCount[compliance] -= 1;
    }

    function _identityOf(address compliance, address wallet) private view returns (address) {
        address id = address(
            IToken(IModularCompliance(compliance).getTokenBound()).identityRegistry().identity(wallet)
        );
        if (id == address(0)) revert IdentityNotFound(wallet);
        return id;
    }
}
