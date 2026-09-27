// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import "./SuiteDeployer.sol";

/// @notice Deploys the full ERC-3643 platform. The deployer becomes platform admin and compliance officer.
/// @dev Env: INITIAL_ISSUERS (optional, comma-separated) wallets allowed to create tokens.
///      forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --sender $PLATFORM_ADMIN --broadcast --verify
contract Deploy is Script, SuiteDeployer {
    function run() external returns (Suite memory s) {
        address[] memory issuers = vm.envOr("INITIAL_ISSUERS", ",", new address[](0));

        vm.startBroadcast();
        s = _deploySuite(msg.sender);
        bytes32 issuerRole = s.platform.ISSUER_ROLE();
        s.platform.grantRole(issuerRole, msg.sender);
        for (uint256 i; i < issuers.length; ++i) {
            s.platform.grantRole(issuerRole, issuers[i]);
        }
        vm.stopBroadcast();

        console2.log("SwissRWAPlatform :", address(s.platform));
        console2.log("AssetRegistry    :", address(s.assets));
        console2.log("TREXFactory      :", address(s.trexFactory));
        console2.log("IdFactory        :", address(s.idFactory));
        console2.log("ClaimIssuer      :", address(s.claimIssuer));
        console2.log("IdentityStorage  :", address(s.identityStorage));
        console2.log("Admin            :", msg.sender);
        console2.log("Chain id         :", block.chainid);
    }
}
