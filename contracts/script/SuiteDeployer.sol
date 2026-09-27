// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "@erc3643/token/Token.sol";
import "@erc3643/registry/implementation/ClaimTopicsRegistry.sol";
import "@erc3643/registry/implementation/IdentityRegistry.sol";
import "@erc3643/registry/implementation/IdentityRegistryStorage.sol";
import "@erc3643/registry/implementation/TrustedIssuersRegistry.sol";
import "@erc3643/compliance/modular/ModularCompliance.sol";
import "@erc3643/proxy/authority/TREXImplementationAuthority.sol";
import "@erc3643/proxy/IdentityRegistryStorageProxy.sol";
import "@erc3643/factory/TREXFactory.sol";
import "@erc3643/compliance/modular/modules/ModuleProxy.sol";
import "@erc3643/compliance/modular/modules/MaxBalanceModule.sol";
import "@erc3643/compliance/modular/modules/CountryRestrictModule.sol";
import "@erc3643/compliance/modular/modules/SupplyLimitModule.sol";

import "@onchain-id/solidity/contracts/Identity.sol";
import "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import "@onchain-id/solidity/contracts/proxy/ImplementationAuthority.sol";
import "@onchain-id/solidity/contracts/proxy/IdentityProxy.sol";
import "@onchain-id/solidity/contracts/factory/IdFactory.sol";

import "../src/SwissRWAPlatform.sol";
import "../src/AssetRegistry.sol";
import "../src/modules/MaxHoldersModule.sol";
import "../src/modules/LockUpModule.sol";

/// @notice Deploys and wires the full platform: official ONCHAINID + T-REX (ERC-3643) contracts,
///         compliance modules, the SwissRWAPlatform (UUPS proxy) and the AssetRegistry, then loads the
///         Swiss-law presets. The caller becomes platform admin and compliance officer.
abstract contract SuiteDeployer {
    struct Suite {
        SwissRWAPlatform platform;
        AssetRegistry assets;
        TREXFactory trexFactory;
        TREXImplementationAuthority trexAuthority;
        IdFactory idFactory;
        ImplementationAuthority identityAuthority;
        ClaimIssuer claimIssuer;
        IdentityRegistryStorage identityStorage;
        MaxHoldersModule maxHolders;
        LockUpModule lockUp;
        MaxBalanceModule maxBalance;
        CountryRestrictModule countryRestrict;
        SupplyLimitModule supplyLimit;
    }

    /// ISO 3166-1 numeric: Russia, Belarus, North Korea, Iran, Myanmar
    uint16[] internal DEFAULT_RESTRICTED = [uint16(643), 112, 408, 364, 104];

    function _deploySuite(address admin) internal returns (Suite memory s) {
        // ---- ONCHAINID
        Identity identityImpl = new Identity(admin, true);
        s.identityAuthority = new ImplementationAuthority(address(identityImpl));
        s.idFactory = new IdFactory(address(s.identityAuthority));

        // ---- T-REX implementations + authority + factory
        s.trexAuthority = new TREXImplementationAuthority(true, address(0), address(0));
        s.trexAuthority.addAndUseTREXVersion(
            ITREXImplementationAuthority.Version(4, 1, 6),
            ITREXImplementationAuthority.TREXContracts({
                tokenImplementation: address(new Token()),
                ctrImplementation: address(new ClaimTopicsRegistry()),
                irImplementation: address(new IdentityRegistry()),
                irsImplementation: address(new IdentityRegistryStorage()),
                tirImplementation: address(new TrustedIssuersRegistry()),
                mcImplementation: address(new ModularCompliance())
            })
        );
        s.trexFactory = new TREXFactory(address(s.trexAuthority), address(s.idFactory));
        s.idFactory.addTokenFactory(address(s.trexFactory));

        // ---- platform (UUPS proxy) + asset registry
        SwissRWAPlatform impl = new SwissRWAPlatform();
        s.platform = SwissRWAPlatform(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(SwissRWAPlatform.initialize, (admin))))
        );
        s.assets = new AssetRegistry(address(s.platform));

        // ---- shared identity storage: platform is agent, factory is owner (required to bind registries)
        s.identityStorage = IdentityRegistryStorage(address(new IdentityRegistryStorageProxy(address(s.trexAuthority))));
        s.identityStorage.addAgent(address(s.platform));
        s.identityStorage.transferOwnership(address(s.trexFactory));

        // ---- claim issuer managed by the platform
        s.claimIssuer = new ClaimIssuer(address(s.platform));

        // ---- compliance modules (upgradeable, behind proxies)
        bytes memory init = abi.encodeWithSignature("initialize()");
        s.maxHolders = MaxHoldersModule(address(new ModuleProxy(address(new MaxHoldersModule()), init)));
        s.lockUp = LockUpModule(address(new ModuleProxy(address(new LockUpModule()), init)));
        s.maxBalance = MaxBalanceModule(address(new ModuleProxy(address(new MaxBalanceModule()), init)));
        s.countryRestrict = CountryRestrictModule(address(new ModuleProxy(address(new CountryRestrictModule()), init)));
        s.supplyLimit = SupplyLimitModule(address(new ModuleProxy(address(new SupplyLimitModule()), init)));

        // ---- hand the factories to the platform and wire it
        s.trexFactory.transferOwnership(address(s.platform));
        s.idFactory.transferOwnership(address(s.platform));

        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(IdentityProxy).creationCode, abi.encode(address(s.identityAuthority), address(s.idFactory))
            )
        );
        s.platform.setInfrastructure(
            address(s.trexFactory),
            address(s.idFactory),
            address(s.claimIssuer),
            address(s.identityStorage),
            initCodeHash,
            address(s.assets),
            SwissRWAPlatform.Modules({
                maxHolders: address(s.maxHolders),
                lockUp: address(s.lockUp),
                maxBalance: address(s.maxBalance),
                countryRestrict: address(s.countryRestrict),
                supplyLimit: address(s.supplyLimit)
            })
        );

        _loadSwissPresets(s.platform);
        s.platform.setDefaultRestrictedCountries(DEFAULT_RESTRICTED);
        s.platform.addComplianceOfficer(admin);
    }

    /// @dev Preset ids are referenced by the web app (References tab). Keep them stable.
    function _loadSwissPresets(SwissRWAPlatform p) internal {
        uint256[] memory kyc = new uint256[](1);
        kyc[0] = 1;
        uint256[] memory kycLexKoller = new uint256[](2);
        kycLexKoller[0] = 1;
        kycLexKoller[1] = 2;
        uint256[] memory kycQualified = new uint256[](2);
        kycQualified[0] = 1;
        kycQualified[1] = 3;

        p.setPreset(0, "Residential real estate", 19, kycLexKoller, true);
        p.setPreset(1, "Commercial real estate", 19, kyc, true);
        p.setPreset(2, "Private credit / debt", 20, kyc, true);
        p.setPreset(3, "Collective investment (qualified investors)", 499, kycQualified, true);
        p.setPreset(4, "Equity", 499, kyc, true);
        p.setPreset(5, "Commodities", 499, kyc, true);
        p.setPreset(6, "Art & collectibles", 499, kyc, true);
    }
}
