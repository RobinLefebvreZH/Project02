// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643/compliance/modular/modules/AbstractModuleUpgradeable.sol";

/// @title LockUpModule
/// @notice ERC-3643 compliance module blocking investor-to-investor transfers until a given date.
///         Issuance (mint) is always allowed; agent actions (burn, forced transfer, recovery) are not
///         subject to compliance checks in ERC-3643 and remain possible during the lock-up.
contract LockUpModule is AbstractModuleUpgradeable {
    /// compliance => unix timestamp until which transfers are locked (0 = no lock-up)
    mapping(address => uint256) private _lockedUntil;

    event LockUpSet(address indexed compliance, uint256 lockedUntil);

    function initialize() external initializer {
        __AbstractModule_init();
    }

    function setLockUp(uint256 lockedUntil) external onlyComplianceCall {
        _lockedUntil[msg.sender] = lockedUntil;
        emit LockUpSet(msg.sender, lockedUntil);
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address from, address, /*to*/ uint256, /*value*/ address compliance)
        external
        view
        override
        returns (bool)
    {
        if (from == address(0)) return true; // minting
        return block.timestamp >= _lockedUntil[compliance];
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure override returns (string memory) {
        return "LockUpModule";
    }

    function getLockedUntil(address compliance) external view returns (uint256) {
        return _lockedUntil[compliance];
    }
}
