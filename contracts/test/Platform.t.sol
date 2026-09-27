// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "forge-std/Test.sol";
import "../script/SuiteDeployer.sol";

contract PlatformTest is Test, SuiteDeployer {
    Suite internal s;
    SwissRWAPlatform internal platform;

    address internal officer;
    uint256 internal officerKey;
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice"); // Swiss resident, Lex Koller eligible
    address internal bob = makeAddr("bob"); // Swiss resident, KYC only
    address internal carol = makeAddr("carol"); // German resident, KYC only
    address internal dmitri = makeAddr("dmitri"); // resident of a restricted country
    address internal eve = makeAddr("eve"); // never onboarded

    uint16 internal constant CH = 756;
    uint16 internal constant DE = 276;
    uint16 internal constant RU = 643;

    function setUp() public {
        s = _deploySuite(address(this));
        platform = s.platform;
        (officer, officerKey) = makeAddrAndKey("officer");
        platform.addComplianceOfficer(officer);
        platform.grantRole(platform.ISSUER_ROLE(), issuer);

        _onboard(alice, CH, _topics2(1, 2));
        _onboard(bob, CH, _topics1(1));
        _onboard(carol, DE, _topics1(1));
        _onboard(dmitri, RU, _topics1(1));
    }

    // ------------------------------------------------------------ helpers

    function _topics1(uint256 a) internal pure returns (uint256[] memory t) {
        t = new uint256[](1);
        t[0] = a;
    }

    function _topics2(uint256 a, uint256 b) internal pure returns (uint256[] memory t) {
        t = new uint256[](2);
        t[0] = a;
        t[1] = b;
    }

    function _sign(address identity, uint256 topic, bytes memory data) internal view returns (bytes memory) {
        bytes32 h = keccak256(abi.encode(identity, topic, data));
        (uint8 v, bytes32 r, bytes32 ss) =
            vm.sign(officerKey, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h)));
        return abi.encodePacked(r, ss, v);
    }

    function _onboard(address wallet, uint16 country, uint256[] memory topics) internal returns (address identity) {
        address predicted = platform.predictIdentity(wallet);
        bytes[] memory sigs = new bytes[](topics.length);
        bytes[] memory data = new bytes[](topics.length);
        for (uint256 i; i < topics.length; ++i) {
            data[i] = bytes("verified");
            sigs[i] = _sign(predicted, topics[i], data[i]);
        }
        vm.prank(officer);
        identity = platform.onboardInvestor(wallet, country, topics, sigs, data);
        assertEq(identity, predicted, "identity prediction");
    }

    function _params(string memory sym, uint8 preset) internal pure returns (SwissRWAPlatform.CreateParams memory p) {
        p.name = string.concat(sym, " Token");
        p.symbol = sym;
        p.decimals = 0;
        p.preset = preset;
        p.assetInfo = IAssetRegistry.AssetInfo({
            assetType: "Real estate",
            jurisdiction: "CH",
            description: "Test asset",
            legalEntity: "Test AG",
            valuation: 1_000_000_00,
            valuationCurrency: "CHF",
            valuationTimestamp: 0,
            metadataURI: ""
        });
    }

    function _create(SwissRWAPlatform.CreateParams memory p) internal returns (IToken t) {
        vm.prank(issuer);
        t = IToken(platform.createToken(p));
        vm.prank(issuer);
        t.unpause(); // T-REX tokens are deployed paused
    }

    function _mint(IToken t, address to, uint256 amount) internal {
        vm.prank(issuer);
        t.mint(to, amount);
    }

    // ------------------------------------------------------------ deployment

    function test_wiring() public view {
        assertEq(s.trexFactory.owner(), address(platform));
        assertEq(s.idFactory.owner(), address(platform));
        assertEq(platform.presetCount(), 7);
        assertEq(platform.getPreset(0).maxHolders, 19);
        assertEq(platform.getPreset(2).maxHolders, 20);
        assertTrue(platform.isDefaultRestricted(RU));
        assertTrue(IIdentity(address(s.claimIssuer)).keyHasPurpose(keccak256(abi.encode(officer)), 3));
    }

    function test_onlyIssuerCanCreate() public {
        SwissRWAPlatform.CreateParams memory p = _params("X", 1);
        vm.prank(eve);
        vm.expectRevert();
        platform.createToken(p);
    }

    function test_createToken_recordsAndOwnership() public {
        IToken t = _create(_params("ZRH", 1));
        SwissRWAPlatform.TokenRecord memory r = platform.tokenRecord(address(t));
        assertEq(r.issuer, issuer);
        assertEq(r.preset, 1);
        assertEq(Ownable(address(t)).owner(), address(platform)); // platform keeps ownership: preset can't be bypassed
        assertTrue(AgentRoleUpgradeable(address(t)).isAgent(issuer));
        assertEq(platform.allTokens().length, 1);
        assertEq(s.assets.assetInfo(address(t)).legalEntity, "Test AG");
        assertEq(s.maxHolders.getMaxHolders(r.compliance), 19);
    }

    function test_maxHoldersAbovePresetReverts() public {
        SwissRWAPlatform.CreateParams memory p = _params("ZRH", 1);
        p.maxHolders = 20;
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(SwissRWAPlatform.MaxHoldersAbovePreset.selector, 20, 19));
        platform.createToken(p);
    }

    // ------------------------------------------------------------ identity & claims

    function test_residential_requiresLexKollerClaim() public {
        IToken t = _create(_params("RES", 0));
        _mint(t, alice, 10); // has KYC + Lex Koller
        assertEq(t.balanceOf(alice), 10);

        vm.prank(issuer);
        vm.expectRevert("Identity is not verified.");
        t.mint(bob, 10); // KYC only

        vm.prank(alice);
        vm.expectRevert("Transfer not possible");
        t.transfer(bob, 1);
    }

    function test_notOnboardedCannotReceive() public {
        IToken t = _create(_params("COM", 1));
        vm.prank(issuer);
        vm.expectRevert("Identity is not verified.");
        t.mint(eve, 1);
    }

    function test_revokedClaim_blocksImmediately() public {
        IToken t = _create(_params("COM", 1));
        _mint(t, alice, 10);
        _mint(t, bob, 10);
        vm.prank(officer);
        platform.revokeInvestorClaim(bob, 1);
        assertFalse(t.identityRegistry().isVerified(bob));
        vm.prank(alice);
        vm.expectRevert("Transfer not possible");
        t.transfer(bob, 1);
    }

    function test_onboardTwice_updatesCountry() public {
        vm.prank(officer);
        platform.setInvestorCountry(carol, CH);
        assertEq(s.identityStorage.storedInvestorCountry(carol), CH);
    }

    // ------------------------------------------------------------ Swiss compliance modules

    function test_maxHolders_countsIdentities() public {
        SwissRWAPlatform.CreateParams memory p = _params("DEBT", 2);
        p.maxHolders = 2;
        IToken t = _create(p);
        _mint(t, alice, 10);
        _mint(t, bob, 10);
        _mint(t, bob, 5); // existing holder: allowed

        vm.prank(issuer);
        vm.expectRevert("Compliance not followed");
        t.mint(carol, 1);

        // a holder leaving frees a slot
        vm.prank(bob);
        t.transfer(alice, 15);
        _mint(t, carol, 1);
        assertEq(s.maxHolders.getHolderCount(platform.tokenRecord(address(t)).compliance), 2);
    }

    function test_restrictedCountry_blocked() public {
        IToken t = _create(_params("COM", 1));
        vm.prank(issuer);
        vm.expectRevert("Compliance not followed");
        t.mint(dmitri, 1);
    }

    function test_cannotUnrestrictDefaultCountry() public {
        IToken t = _create(_params("COM", 1));
        uint16[] memory c = new uint16[](1);
        c[0] = RU;
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(SwissRWAPlatform.CountryIsDefaultRestricted.selector, RU));
        platform.setCountriesRestricted(address(t), c, false);
    }

    function test_extraCountryRestriction() public {
        SwissRWAPlatform.CreateParams memory p = _params("CHONLY", 4);
        p.extraRestrictedCountries = new uint16[](1);
        p.extraRestrictedCountries[0] = DE;
        IToken t = _create(p);
        vm.prank(issuer);
        vm.expectRevert("Compliance not followed");
        t.mint(carol, 1);

        uint16[] memory c = new uint16[](1);
        c[0] = DE;
        vm.prank(issuer);
        platform.setCountriesRestricted(address(t), c, false);
        _mint(t, carol, 1);
    }

    function test_lockUp() public {
        SwissRWAPlatform.CreateParams memory p = _params("LOCK", 4);
        p.lockUpUntil = block.timestamp + 365 days;
        IToken t = _create(p);
        _mint(t, alice, 10); // issuance allowed during lock-up
        vm.prank(alice);
        vm.expectRevert("Transfer not possible");
        t.transfer(bob, 1);

        vm.warp(block.timestamp + 365 days);
        vm.prank(alice);
        t.transfer(bob, 1);
        assertEq(t.balanceOf(bob), 1);
    }

    function test_maxBalance() public {
        SwissRWAPlatform.CreateParams memory p = _params("MAXB", 4);
        p.maxBalance = 100;
        IToken t = _create(p);
        _mint(t, alice, 100);
        assertEq(platform.maxBalanceOf(address(t)), 100);
        vm.prank(issuer);
        vm.expectRevert("Compliance not followed");
        t.mint(alice, 1);
    }

    function test_supplyLimit() public {
        SwissRWAPlatform.CreateParams memory p = _params("CAP", 4);
        p.supplyLimit = 1000;
        IToken t = _create(p);
        _mint(t, alice, 1000);
        vm.prank(issuer);
        vm.expectRevert("Compliance not followed");
        t.mint(bob, 1);
    }

    function test_issuerAdjustsWithinPreset() public {
        IToken t = _create(_params("ADJ", 1));
        vm.startPrank(issuer);
        platform.setMaxHolders(address(t), 5);
        vm.expectRevert(abi.encodeWithSelector(SwissRWAPlatform.MaxHoldersAbovePreset.selector, 25, 19));
        platform.setMaxHolders(address(t), 25);
        platform.setLockUp(address(t), block.timestamp + 1 days);
        platform.setMaxBalance(address(t), 50);
        vm.stopPrank();

        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(SwissRWAPlatform.NotTokenIssuer.selector, address(t), eve));
        platform.setLockUp(address(t), 0);
    }

    function test_qualifiedInvestorPreset() public {
        IToken t = _create(_params("FUND", 3));
        vm.prank(issuer);
        vm.expectRevert("Identity is not verified.");
        t.mint(bob, 1);

        address frank = makeAddr("frank");
        _onboard(frank, CH, _topics2(1, 3));
        _mint(t, frank, 1);
    }

    // ------------------------------------------------------------ ERC-3643 agent features

    function test_freezeAndForcedTransfer() public {
        IToken t = _create(_params("FRZ", 1));
        _mint(t, alice, 10);
        vm.prank(issuer);
        t.setAddressFrozen(alice, true);
        vm.prank(alice);
        vm.expectRevert("wallet is frozen");
        t.transfer(bob, 1);

        vm.prank(issuer);
        t.forcedTransfer(alice, bob, 4);
        assertEq(t.balanceOf(bob), 4);
    }

    function test_partialFreeze() public {
        IToken t = _create(_params("PFZ", 1));
        _mint(t, alice, 10);
        vm.prank(issuer);
        t.freezePartialTokens(alice, 8);
        vm.prank(alice);
        vm.expectRevert("Insufficient Balance");
        t.transfer(bob, 3);
        vm.prank(alice);
        t.transfer(bob, 2);
    }

    function test_recovery() public {
        IToken t = _create(_params("REC", 1));
        _mint(t, bob, 10);
        address bobNew = makeAddr("bobNew");
        address bobId = address(s.identityStorage.storedIdentity(bob));

        vm.prank(officer);
        platform.addRecoveryWallet(bobId, bobNew);
        vm.prank(issuer);
        t.recoveryAddress(bob, bobNew, bobId);
        assertEq(t.balanceOf(bobNew), 10);
        assertTrue(t.identityRegistry().isVerified(bobNew));
        assertEq(s.maxHolders.getHolderCount(platform.tokenRecord(address(t)).compliance), 1);
    }

    function test_emergencyPause() public {
        IToken t = _create(_params("EMG", 1));
        _mint(t, alice, 10);
        platform.emergencyPause(address(t));
        assertTrue(t.paused());
        vm.prank(eve);
        vm.expectRevert();
        platform.emergencyPause(address(t));
    }

    function test_burn() public {
        IToken t = _create(_params("BRN", 1));
        _mint(t, alice, 10);
        vm.prank(issuer);
        t.burn(alice, 10);
        assertEq(t.totalSupply(), 0);
        assertEq(s.maxHolders.getHolderCount(platform.tokenRecord(address(t)).compliance), 0);
    }

    // ------------------------------------------------------------ asset registry

    function test_assetDocuments() public {
        IToken t = _create(_params("DOC", 1));
        vm.prank(issuer);
        s.assets.setDocument(address(t), "prospectus", "ipfs://p", keccak256("p"));
        assertEq(s.assets.getAllDocuments(address(t)).length, 1);
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.NotTokenManager.selector, address(t), eve));
        s.assets.setDocument(address(t), "x", "ipfs://x", 0);
        vm.prank(issuer);
        s.assets.updateValuation(address(t), 2_000_000_00, "CHF");
        assertEq(s.assets.assetInfo(address(t)).valuation, 2_000_000_00);
    }

    // ------------------------------------------------------------ admin

    function test_presetUpdate_onlyAdmin() public {
        uint256[] memory kyc = _topics1(1);
        vm.prank(eve);
        vm.expectRevert();
        platform.setPreset(1, "x", 10, kyc, true);
        platform.setPreset(1, "Commercial real estate", 10, kyc, true);
        assertEq(platform.getPreset(1).maxHolders, 10);
    }

    function test_upgrade_onlyAdmin() public {
        SwissRWAPlatform newImpl = new SwissRWAPlatform();
        vm.prank(eve);
        vm.expectRevert();
        platform.upgradeTo(address(newImpl));
        platform.upgradeTo(address(newImpl));
        assertEq(platform.presetCount(), 7); // state kept
    }

    function test_nonOfficerCannotOnboard() public {
        vm.prank(eve);
        vm.expectRevert();
        platform.onboardInvestor(eve, CH, new uint256[](0), new bytes[](0), new bytes[](0));
    }
}
