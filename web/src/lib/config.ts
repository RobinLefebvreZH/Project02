import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  rabbyWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http, type Address } from "viem";
import { createConfig } from "wagmi";
import { mainnet, sepolia, anvil } from "wagmi/chains";

const enableLocal = process.env.NEXT_PUBLIC_ENABLE_LOCAL === "true";

export const PLATFORM_ADDRESSES: Record<number, Address | undefined> = {
  [mainnet.id]: (process.env.NEXT_PUBLIC_PLATFORM_ADDRESS_MAINNET || undefined) as Address | undefined,
  [sepolia.id]: (process.env.NEXT_PUBLIC_PLATFORM_ADDRESS_SEPOLIA || undefined) as Address | undefined,
  [anvil.id]: (process.env.NEXT_PUBLIC_PLATFORM_ADDRESS_LOCAL || undefined) as Address | undefined,
};

// The first chain is the default before a wallet connects: prefer chains where the platform is deployed.
const supported = enableLocal ? [mainnet, sepolia, anvil] : [mainnet, sepolia];
const ordered = [...supported].sort((a, b) => Number(!PLATFORM_ADDRESSES[a.id]) - Number(!PLATFORM_ADDRESSES[b.id]));
export const chains = ordered as unknown as readonly [(typeof supported)[number], ...(typeof supported)[number][]];

export const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

// A placeholder id lets the app run locally with browser wallets (MetaMask, Rabby).
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    { groupName: "Recommended", wallets: [metaMaskWallet, rabbyWallet, injectedWallet] },
    { groupName: "Institutional", wallets: [safeWallet, ledgerWallet, walletConnectWallet] },
  ],
  { appName: "ERC-3643 Platform", projectId },
);

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL || undefined),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || undefined),
    [anvil.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

export function explorerUrl(chainId: number | undefined, kind: "address" | "tx", value: string) {
  if (chainId === mainnet.id) return `https://etherscan.io/${kind}/${value}`;
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/${kind}/${value}`;
  return undefined;
}

export function ipfsToHttp(uri: string) {
  return uri.startsWith("ipfs://") ? IPFS_GATEWAY + uri.slice("ipfs://".length) : uri;
}
