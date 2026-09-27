// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "@erc3643/factory/ITREXFactory.sol";
import "@erc3643/token/IToken.sol";
import "@erc3643/compliance/modular/IModularCompliance.sol";
import "@erc3643/registry/interface/IIdentityRegistryStorage.sol";
import "@erc3643/roles/AgentRoleUpgradeable.sol";

import "@onchain-id/solidity/contracts/factory/IIdFactory.sol";
import "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";

import "./modules/MaxHoldersModule.sol";
import "./modules/LockUpModule.sol";
import "./interfaces/IAssetRegistry.sol";

interface IMaxBalanceModule {
    function setMaxBalance(uint256 max) external;
}

interface ISupplyLimitModule {
    function setSupplyLimit(uint256 limit) external;
}

interface ICountryRestrictModule {
    function batchRestrictCountries(uint16[] calldata countries) external;
    function batchUnrestrictCountries(uint16[] calldata countries) external;
}

/// @title SwissRWAPlatform
/// @notice Issuance platform for ERC-3643 (T-REX) security tokens backed by Swiss real-world assets.
/// @dev The platform owns the official TREXFactory and ONCHAINID IdFactory and keeps ownership of every
///      token suite it deploys, so the Swiss-law preset of a token (required investor claims and holder cap)
///      cannot be bypassed. Issuers act as token agents (mint, burn, freeze, pause, forced transfer, recovery)
///      and adjust compliance settings through this contract, within the bounds of their token's preset.
///      Investors are onboarded once, platform-wide: one ONCHAINID per investor, claims signed by a compliance
///      officer through the platform's ClaimIssuer, and a single shared IdentityRegistryStorage.
contract SwissRWAPlatform is Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    using Strings for address;

    // ------------------------------------------------------------------ roles & claim topics

    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant COMPLIANCE_OFFICER_ROLE = keccak256("COMPLIANCE_OFFICER_ROLE");

    /// @notice Investor identified and screened under the Anti-Money Laundering Act (AMLA).
    uint256 public constant TOPIC_KYC_AML = 1;
    /// @notice Investor is not a "person abroad" under Lex Koller (BewG Art. 5).
    uint256 public constant TOPIC_LEX_KOLLER = 2;
    /// @notice Investor is a qualified investor under CISA Art. 10 para. 3 / 3ter.
    uint256 public constant TOPIC_QUALIFIED_INVESTOR = 3;

    // ------------------------------------------------------------------ types

    struct Preset {
        string name;
        uint16 maxHolders; // hard ceiling for this asset type (0 = none)
        uint256[] claimTopics; // claims every holder must have
        bool active;
    }

    struct TokenRecord {
        address issuer;
        uint8 preset;
        address compliance;
        address identityRegistry;
        uint64 createdAt;
    }

    struct CreateParams {
        string name;
        string symbol;
        uint8 decimals;
        uint8 preset;
        uint16 maxHolders; // 0 = preset ceiling
        uint256 lockUpUntil; // 0 = none
        uint256 maxBalance; // 0 = none
        uint256 supplyLimit; // 0 = none
        uint16[] extraRestrictedCountries;
        IAssetRegistry.AssetInfo assetInfo;
    }

    struct Modules {
        address maxHolders;
        address lockUp;
        address maxBalance;
        address countryRestrict;
        address supplyLimit;
    }

    // ------------------------------------------------------------------ storage

    ITREXFactory public trexFactory;
    IIdFactory public idFactory;
    IClaimIssuer public claimIssuer;
    IIdentityRegistryStorage public identityStorage;
    /// keccak256 of the ONCHAINID IdentityProxy init code used by the IdFactory for investor identities
    bytes32 public identityInitCodeHash;
    IAssetRegistry public assetRegistry;
    Modules public modules;

    Preset[] private _presets;
    uint16[] private _defaultRestrictedCountries;
    mapping(uint16 => bool) public isDefaultRestricted;

    address[] private _tokens;
    mapping(address => TokenRecord) private _records;
    mapping(address => address[]) private _tokensByIssuer;
    /// @notice Max balance per investor currently configured for a token (0 = none); mirrors MaxBalanceModule.
    mapping(address => uint256) public maxBalanceOf;

    // ------------------------------------------------------------------ events & errors

    event InfrastructureSet(address trexFactory, address idFactory, address claimIssuer, address identityStorage);
    event PresetSet(uint8 indexed id, string name, uint16 maxHolders, uint256[] claimTopics, bool active);
    event DefaultRestrictedCountriesSet(uint16[] countries);
    event TokenCreated(address indexed token, address indexed issuer, uint8 indexed preset, string name, string symbol);
    event ComplianceUpdated(address indexed token, string setting, uint256 value);
    event InvestorOnboarded(address indexed wallet, address indexed identity, uint16 country, uint256[] topics);
    event InvestorClaimRevoked(address indexed wallet, address indexed identity, uint256 topic);
    event InvestorCountryUpdated(address indexed wallet, uint16 country);

    error NotConfigured();
    error UnknownToken(address token);
    error NotTokenIssuer(address token, address account);
    error InvalidPreset(uint8 preset);
    error MaxHoldersAbovePreset(uint16 requested, uint16 ceiling);
    error CountryIsDefaultRestricted(uint16 country);
    error LengthMismatch();
    error IdentityMismatch(address expected, address actual);
    error ZeroAddress();

    // ------------------------------------------------------------------ setup

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_OFFICER_ROLE, admin);
    }

    /// @notice Wire the official T-REX / ONCHAINID contracts. The platform must already own the TREXFactory
    ///         and IdFactory, be the management key of the ClaimIssuer and an agent of the identity storage.
    function setInfrastructure(
        address _trexFactory,
        address _idFactory,
        address _claimIssuer,
        address _identityStorage,
        bytes32 _identityInitCodeHash,
        address _assetRegistry,
        Modules calldata _modules
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        trexFactory = ITREXFactory(_trexFactory);
        idFactory = IIdFactory(_idFactory);
        claimIssuer = IClaimIssuer(_claimIssuer);
        identityStorage = IIdentityRegistryStorage(_identityStorage);
        identityInitCodeHash = _identityInitCodeHash;
        assetRegistry = IAssetRegistry(_assetRegistry);
        modules = _modules;
        emit InfrastructureSet(_trexFactory, _idFactory, _claimIssuer, _identityStorage);
    }

    /// @notice Create or update an asset-type preset (e.g. after a change in Swiss law).
    function setPreset(uint8 id, string calldata name, uint16 maxHolders, uint256[] calldata claimTopics, bool active)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (claimTopics.length == 0 || claimTopics.length > 5) revert InvalidPreset(id);
        if (id == _presets.length) {
            _presets.push();
        } else if (id > _presets.length) {
            revert InvalidPreset(id);
        }
        Preset storage p = _presets[id];
        p.name = name;
        p.maxHolders = maxHolders;
        p.claimTopics = claimTopics;
        p.active = active;
        emit PresetSet(id, name, maxHolders, claimTopics, active);
    }

    /// @notice Countries every token restricts by default (sanctions / FATF call-for-action lists).
    function setDefaultRestrictedCountries(uint16[] calldata countries) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i; i < _defaultRestrictedCountries.length; ++i) {
            isDefaultRestricted[_defaultRestrictedCountries[i]] = false;
        }
        _defaultRestrictedCountries = countries;
        for (uint256 i; i < countries.length; ++i) {
            isDefaultRestricted[countries[i]] = true;
        }
        emit DefaultRestrictedCountriesSet(countries);
    }

    /// @notice Grant the officer role and register the officer's wallet as a claim signer on the ClaimIssuer.
    function addComplianceOfficer(address officer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(COMPLIANCE_OFFICER_ROLE, officer);
        bytes32 key = keccak256(abi.encode(officer));
        if (!IIdentity(address(claimIssuer)).keyHasPurpose(key, 3)) {
            IIdentity(address(claimIssuer)).addKey(key, 3, 1);
        }
    }

    function removeComplianceOfficer(address officer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(COMPLIANCE_OFFICER_ROLE, officer);
        bytes32 key = keccak256(abi.encode(officer));
        if (IIdentity(address(claimIssuer)).keyHasPurpose(key, 3)) {
            IIdentity(address(claimIssuer)).removeKey(key, 3);
        }
    }

    // ------------------------------------------------------------------ issuance

    function createToken(CreateParams calldata p) external onlyRole(ISSUER_ROLE) returns (address token) {
        if (address(trexFactory) == address(0)) revert NotConfigured();
        if (p.preset >= _presets.length || !_presets[p.preset].active) revert InvalidPreset(p.preset);
        Preset storage preset = _presets[p.preset];

        uint16 maxHolders = p.maxHolders == 0 ? preset.maxHolders : p.maxHolders;
        if (preset.maxHolders != 0 && maxHolders > preset.maxHolders) {
            revert MaxHoldersAbovePreset(maxHolders, preset.maxHolders);
        }

        ITREXFactory.TokenDetails memory details = _tokenDetails(p, maxHolders);
        ITREXFactory.ClaimDetails memory claims = _claimDetails(preset.claimTopics);

        trexFactory.deployTREXSuite(p.symbol, details, claims);
        token = trexFactory.getToken(p.symbol);

        IToken t = IToken(token);
        _records[token] = TokenRecord({
            issuer: msg.sender,
            preset: p.preset,
            compliance: address(t.compliance()),
            identityRegistry: address(t.identityRegistry()),
            createdAt: uint64(block.timestamp)
        });
        _tokens.push(token);
        _tokensByIssuer[msg.sender].push(token);
        maxBalanceOf[token] = p.maxBalance;
        if (address(assetRegistry) != address(0)) assetRegistry.initAsset(token, p.assetInfo);

        emit TokenCreated(token, msg.sender, p.preset, p.name, p.symbol);
    }

    function _tokenDetails(CreateParams calldata p, uint16 maxHolders)
        private
        view
        returns (ITREXFactory.TokenDetails memory d)
    {
        Modules memory m = modules;
        address[] memory agents = new address[](2);
        agents[0] = msg.sender;
        agents[1] = address(this);

        address[] memory mods = new address[](5);
        bytes[] memory settings = new bytes[](5);
        mods[0] = m.maxHolders;
        settings[0] = abi.encodeCall(MaxHoldersModule.setMaxHolders, (maxHolders));
        mods[1] = m.lockUp;
        settings[1] = abi.encodeCall(LockUpModule.setLockUp, (p.lockUpUntil));
        mods[2] = m.maxBalance;
        settings[2] = abi.encodeCall(IMaxBalanceModule.setMaxBalance, (_orMax(p.maxBalance)));
        mods[3] = m.supplyLimit;
        settings[3] = abi.encodeCall(ISupplyLimitModule.setSupplyLimit, (_orMax(p.supplyLimit)));
        mods[4] = m.countryRestrict;
        settings[4] = abi.encodeCall(ICountryRestrictModule.batchRestrictCountries, (_restrictedList(p.extraRestrictedCountries)));

        d.owner = address(this);
        d.name = p.name;
        d.symbol = p.symbol;
        d.decimals = p.decimals;
        d.irs = address(identityStorage);
        d.ONCHAINID = address(0);
        d.irAgents = new address[](0);
        d.tokenAgents = agents;
        d.complianceModules = mods;
        d.complianceSettings = settings;
    }

    function _claimDetails(uint256[] storage topics) private view returns (ITREXFactory.ClaimDetails memory c) {
        c.claimTopics = topics;
        c.issuers = new address[](1);
        c.issuers[0] = address(claimIssuer);
        c.issuerClaims = new uint256[][](1);
        c.issuerClaims[0] = topics;
    }

    function _restrictedList(uint16[] calldata extra) private view returns (uint16[] memory list) {
        uint256 n = _defaultRestrictedCountries.length;
        list = new uint16[](n + extra.length);
        for (uint256 i; i < n; ++i) list[i] = _defaultRestrictedCountries[i];
        for (uint256 i; i < extra.length; ++i) list[n + i] = extra[i];
    }

    function _orMax(uint256 v) private pure returns (uint256) {
        return v == 0 ? type(uint256).max : v;
    }

    // ------------------------------------------------------------------ issuer controls (bounded by preset)

    modifier onlyTokenIssuer(address token) {
        if (_records[token].issuer == address(0)) revert UnknownToken(token);
        if (msg.sender != _records[token].issuer) revert NotTokenIssuer(token, msg.sender);
        _;
    }

    function setMaxHolders(address token, uint16 maxHolders) external onlyTokenIssuer(token) {
        uint16 ceiling = _presets[_records[token].preset].maxHolders;
        if (ceiling != 0 && (maxHolders == 0 || maxHolders > ceiling)) revert MaxHoldersAbovePreset(maxHolders, ceiling);
        _callModule(token, modules.maxHolders, abi.encodeCall(MaxHoldersModule.setMaxHolders, (maxHolders)));
        emit ComplianceUpdated(token, "maxHolders", maxHolders);
    }

    function setLockUp(address token, uint256 lockedUntil) external onlyTokenIssuer(token) {
        _callModule(token, modules.lockUp, abi.encodeCall(LockUpModule.setLockUp, (lockedUntil)));
        emit ComplianceUpdated(token, "lockUp", lockedUntil);
    }

    function setMaxBalance(address token, uint256 maxBalance) external onlyTokenIssuer(token) {
        _callModule(token, modules.maxBalance, abi.encodeCall(IMaxBalanceModule.setMaxBalance, (_orMax(maxBalance))));
        maxBalanceOf[token] = maxBalance;
        emit ComplianceUpdated(token, "maxBalance", maxBalance);
    }

    function setSupplyLimit(address token, uint256 limit) external onlyTokenIssuer(token) {
        _callModule(token, modules.supplyLimit, abi.encodeCall(ISupplyLimitModule.setSupplyLimit, (_orMax(limit))));
        emit ComplianceUpdated(token, "supplyLimit", limit);
    }

    function setCountriesRestricted(address token, uint16[] calldata countries, bool restricted)
        external
        onlyTokenIssuer(token)
    {
        if (!restricted) {
            for (uint256 i; i < countries.length; ++i) {
                if (isDefaultRestricted[countries[i]]) revert CountryIsDefaultRestricted(countries[i]);
            }
        }
        bytes memory data = restricted
            ? abi.encodeCall(ICountryRestrictModule.batchRestrictCountries, (countries))
            : abi.encodeCall(ICountryRestrictModule.batchUnrestrictCountries, (countries));
        _callModule(token, modules.countryRestrict, data);
        emit ComplianceUpdated(token, restricted ? "countryRestricted" : "countryUnrestricted", countries.length);
    }

    function addTokenAgent(address token, address agent) external onlyTokenIssuer(token) {
        AgentRoleUpgradeable(token).addAgent(agent);
    }

    function removeTokenAgent(address token, address agent) external onlyTokenIssuer(token) {
        AgentRoleUpgradeable(token).removeAgent(agent);
    }

    /// @notice Emergency stop by the platform (e.g. regulator order). The issuer can unpause as token agent.
    function emergencyPause(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_records[token].issuer == address(0)) revert UnknownToken(token);
        IToken(token).pause();
    }

    function _callModule(address token, address module, bytes memory data) private {
        IModularCompliance(_records[token].compliance).callModuleFunction(data, module);
    }

    // ------------------------------------------------------------------ investor onboarding (KYC desk)

    /// @notice Address the investor's ONCHAINID will have (so claims can be signed before it exists).
    function predictIdentity(address wallet) public view returns (address) {
        address existing = idFactory.getIdentity(wallet);
        if (existing != address(0)) return existing;
        bytes32 salt = keccak256(abi.encodePacked(string.concat("OID", wallet.toHexString())));
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(idFactory), salt, identityInitCodeHash))))
        );
    }

    /// @notice Hash a compliance officer signs (with an Ethereum signed-message prefix) to issue a claim.
    function claimHash(address identity, uint256 topic, bytes calldata data) external pure returns (bytes32) {
        return keccak256(abi.encode(identity, topic, data));
    }

    /// @notice Create (if needed) the investor's ONCHAINID, attach signed claims and register the investor
    ///         and their country in the shared identity storage used by every token on the platform.
    /// @param country ISO 3166-1 numeric code of the investor's residence (e.g. 756 = Switzerland).
    function onboardInvestor(
        address wallet,
        uint16 country,
        uint256[] calldata topics,
        bytes[] calldata signatures,
        bytes[] calldata data
    ) external onlyRole(COMPLIANCE_OFFICER_ROLE) returns (address identity) {
        if (wallet == address(0)) revert ZeroAddress();
        if (topics.length != signatures.length || topics.length != data.length) revert LengthMismatch();

        identity = idFactory.getIdentity(wallet);
        if (identity == address(0)) {
            address predicted = predictIdentity(wallet);
            bytes32[] memory keys = new bytes32[](1);
            keys[0] = keccak256(abi.encode(address(this)));
            identity = idFactory.createIdentityWithManagementKeys(wallet, wallet.toHexString(), keys);
            if (identity != predicted) revert IdentityMismatch(predicted, identity);
        }

        for (uint256 i; i < topics.length; ++i) {
            IIdentity(identity).addClaim(topics[i], 1, address(claimIssuer), signatures[i], data[i], "");
        }

        if (address(identityStorage.storedIdentity(wallet)) == address(0)) {
            identityStorage.addIdentityToStorage(wallet, IIdentity(identity), country);
        } else {
            identityStorage.modifyStoredInvestorCountry(wallet, country);
        }
        emit InvestorOnboarded(wallet, identity, country, topics);
    }

    function setInvestorCountry(address wallet, uint16 country) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        identityStorage.modifyStoredInvestorCountry(wallet, country);
        emit InvestorCountryUpdated(wallet, country);
    }

    /// @notice Revoke a claim (e.g. KYC expired, investor moved abroad). Takes effect immediately on every token.
    function revokeInvestorClaim(address wallet, uint256 topic) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        address identity = idFactory.getIdentity(wallet);
        if (identity == address(0)) identity = address(identityStorage.storedIdentity(wallet));
        bytes32 claimId = keccak256(abi.encode(address(claimIssuer), topic));
        claimIssuer.revokeClaim(claimId, identity);
        emit InvestorClaimRevoked(wallet, identity, topic);
    }

    /// @notice Allow a replacement wallet on the investor's ONCHAINID so a token agent can run
    ///         ERC-3643 `recoveryAddress` after the investor lost access to their wallet.
    function addRecoveryWallet(address identity, address newWallet) external onlyRole(COMPLIANCE_OFFICER_ROLE) {
        IIdentity(identity).addKey(keccak256(abi.encode(newWallet)), 1, 1);
    }

    // ------------------------------------------------------------------ views

    function presetCount() external view returns (uint256) {
        return _presets.length;
    }

    function getPreset(uint8 id) external view returns (Preset memory) {
        return _presets[id];
    }

    function defaultRestrictedCountries() external view returns (uint16[] memory) {
        return _defaultRestrictedCountries;
    }

    function allTokens() external view returns (address[] memory) {
        return _tokens;
    }

    function tokensOf(address issuer) external view returns (address[] memory) {
        return _tokensByIssuer[issuer];
    }

    function tokenRecord(address token) external view returns (TokenRecord memory) {
        return _records[token];
    }

    // ------------------------------------------------------------------ upgrades

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
