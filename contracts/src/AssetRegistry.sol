// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@erc3643/roles/AgentRoleUpgradeable.sol";
import "./interfaces/IAssetRegistry.sol";

interface IPlatformRecords {
    struct TokenRecord {
        address issuer;
        uint8 preset;
        address compliance;
        address identityRegistry;
        uint64 createdAt;
    }

    function tokenRecord(address token) external view returns (TokenRecord memory);
}

/// @title AssetRegistry
/// @notice On-chain description of the real-world asset behind each platform token: asset type, jurisdiction,
///         legal entity, valuation, and legal documents (URI + keccak256 hash, ERC-1643 style).
///         Written by the token's issuer or its agents; initialised by the platform at token creation.
contract AssetRegistry is IAssetRegistry {
    struct Document {
        string uri;
        bytes32 hash;
        uint64 timestamp;
    }

    address public immutable platform;

    mapping(address => AssetInfo) private _assetInfo;
    mapping(address => mapping(bytes32 => Document)) private _documents;
    mapping(address => bytes32[]) private _documentNames;
    mapping(address => mapping(bytes32 => uint256)) private _documentIndex;

    event AssetInfoUpdated(address indexed token);
    event DocumentUpdated(address indexed token, bytes32 indexed name, string uri, bytes32 documentHash);
    event DocumentRemoved(address indexed token, bytes32 indexed name);

    error OnlyPlatform();
    error NotTokenManager(address token, address account);
    error InvalidDocument();

    constructor(address _platform) {
        platform = _platform;
    }

    modifier onlyTokenManager(address token) {
        address issuer = IPlatformRecords(platform).tokenRecord(token).issuer;
        if (issuer == address(0) || (msg.sender != issuer && !AgentRoleUpgradeable(token).isAgent(msg.sender))) {
            revert NotTokenManager(token, msg.sender);
        }
        _;
    }

    function initAsset(address token, AssetInfo calldata info) external override {
        if (msg.sender != platform) revert OnlyPlatform();
        _set(token, info);
    }

    function setAssetInfo(address token, AssetInfo calldata info) external onlyTokenManager(token) {
        _set(token, info);
    }

    function updateValuation(address token, uint256 valuation, string calldata currency)
        external
        onlyTokenManager(token)
    {
        AssetInfo storage a = _assetInfo[token];
        a.valuation = valuation;
        a.valuationCurrency = currency;
        a.valuationTimestamp = uint64(block.timestamp);
        emit AssetInfoUpdated(token);
    }

    function setDocument(address token, bytes32 name, string calldata uri, bytes32 docHash)
        external
        onlyTokenManager(token)
    {
        if (name == bytes32(0) || bytes(uri).length == 0) revert InvalidDocument();
        _documents[token][name] = Document(uri, docHash, uint64(block.timestamp));
        if (_documentIndex[token][name] == 0) {
            _documentNames[token].push(name);
            _documentIndex[token][name] = _documentNames[token].length;
        }
        emit DocumentUpdated(token, name, uri, docHash);
    }

    function removeDocument(address token, bytes32 name) external onlyTokenManager(token) {
        uint256 idx = _documentIndex[token][name];
        if (idx == 0) revert InvalidDocument();
        bytes32[] storage names = _documentNames[token];
        uint256 last = names.length;
        if (idx != last) {
            bytes32 moved = names[last - 1];
            names[idx - 1] = moved;
            _documentIndex[token][moved] = idx;
        }
        names.pop();
        delete _documentIndex[token][name];
        delete _documents[token][name];
        emit DocumentRemoved(token, name);
    }

    function assetInfo(address token) external view returns (AssetInfo memory) {
        return _assetInfo[token];
    }

    function getDocument(address token, bytes32 name) external view returns (Document memory) {
        return _documents[token][name];
    }

    function getAllDocuments(address token) external view returns (bytes32[] memory) {
        return _documentNames[token];
    }

    function _set(address token, AssetInfo memory info) private {
        info.valuationTimestamp = uint64(block.timestamp);
        _assetInfo[token] = info;
        emit AssetInfoUpdated(token);
    }
}
