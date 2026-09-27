// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

interface IAssetRegistry {
    struct AssetInfo {
        string assetType;
        string jurisdiction;
        string description;
        string legalEntity;
        uint256 valuation; // smallest currency unit (cents)
        string valuationCurrency;
        uint64 valuationTimestamp;
        string metadataURI;
    }

    function initAsset(address token, AssetInfo calldata info) external;
}
