"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Address } from "viem";
import { useAccount, useReadContracts, useSwitchChain } from "wagmi";
import { platformAbi } from "@/abi/platformAbi";
import { chains, PLATFORM_ADDRESSES } from "@/lib/config";
import { usePlatformAddress } from "@/lib/hooks";
import { Notice } from "./ui";

export type PlatformInfo = {
  platform: Address;
  assetRegistry: Address;
  identityStorage: Address;
  claimIssuer: Address;
  modules: { maxHolders: Address; lockUp: Address; maxBalance: Address; countryRestrict: Address; supplyLimit: Address };
};

const Ctx = createContext<PlatformInfo | null>(null);

export function usePlatform(): PlatformInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlatform must be used inside <PlatformGuard>");
  return v;
}

function Loader({ platform, children }: { platform: Address; children: ReactNode }) {
  const c = { address: platform, abi: platformAbi } as const;
  const { data, error } = useReadContracts({
    contracts: [
      { ...c, functionName: "assetRegistry" },
      { ...c, functionName: "identityStorage" },
      { ...c, functionName: "claimIssuer" },
      { ...c, functionName: "modules" },
    ],
  });
  if (error) return <Notice>Could not read the platform contract: {error.message.split("\n")[0]}</Notice>;
  if (!data || data.some((d) => d.status !== "success")) return <Notice>Loading…</Notice>;
  const m = data[3].result as readonly [Address, Address, Address, Address, Address];
  const info: PlatformInfo = {
    platform,
    assetRegistry: data[0].result as Address,
    identityStorage: data[1].result as Address,
    claimIssuer: data[2].result as Address,
    modules: { maxHolders: m[0], lockUp: m[1], maxBalance: m[2], countryRestrict: m[3], supplyLimit: m[4] },
  };
  return <Ctx.Provider value={info}>{children}</Ctx.Provider>;
}

/** Renders children only when the platform is deployed on the connected chain. */
export function PlatformGuard({ children }: { children: ReactNode }) {
  const { platform, chainId } = usePlatformAddress();
  const { chain, isConnected } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  const target = chains.find((c) => PLATFORM_ADDRESSES[c.id]);

  if (!platform) {
    return (
      <Notice>
        {target ? (
          <>
            <p>
              Your wallet is on <strong>{chain?.name ?? `chain ${chainId}`}</strong>, but the platform runs on{" "}
              <strong>{target.name}</strong>.
            </p>
            {isConnected && (
              <button className="btn mt-3" disabled={isPending} onClick={() => switchChain({ chainId: target.id })}>
                {isPending ? "Switching…" : `Switch to ${target.name}`}
              </button>
            )}
            {error && <p className="mt-2 text-[11px]">Your wallet refused to switch network.</p>}
          </>
        ) : (
          <>
            The platform is not deployed yet. Run the Foundry deploy script and set{" "}
            <code>NEXT_PUBLIC_PLATFORM_ADDRESS_*</code> in <code>web/.env.local</code>.
          </>
        )}
      </Notice>
    );
  }
  return <Loader platform={platform}>{children}</Loader>;
}
