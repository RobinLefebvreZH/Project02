"use client";

import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { useReadContracts } from "wagmi";
import { tokenAbi } from "@/abi/tokenAbi";
import { platformAbi } from "@/abi/platformAbi";
import { assetRegistryAbi } from "@/abi/assetRegistryAbi";
import { maxHoldersAbi } from "@/abi/maxHoldersAbi";
import { lockUpAbi } from "@/abi/lockUpAbi";
import { supplyLimitAbi } from "@/abi/supplyLimitAbi";
import { usePlatform } from "./PlatformGuard";
import { PRESETS } from "@/lib/swiss";

const MAX_UINT = 2n ** 256n - 1n;

export function useTokenSummary(address: Address) {
  const p = usePlatform();
  const t = { address, abi: tokenAbi } as const;
  const base = useReadContracts({
    contracts: [
      { ...t, functionName: "name" },
      { ...t, functionName: "symbol" },
      { ...t, functionName: "decimals" },
      { ...t, functionName: "totalSupply" },
      { ...t, functionName: "paused" },
      { address: p.platform, abi: platformAbi, functionName: "tokenRecord", args: [address] },
      { address: p.assetRegistry, abi: assetRegistryAbi, functionName: "assetInfo", args: [address] },
      { address: p.platform, abi: platformAbi, functionName: "maxBalanceOf", args: [address] },
    ],
  });
  const record = base.data?.[5].result as
    | { issuer: Address; preset: number; compliance: Address; identityRegistry: Address; createdAt: bigint }
    | undefined;
  const compliance = record?.compliance;
  const rules = useReadContracts({
    contracts: compliance
      ? [
          { address: p.modules.maxHolders, abi: maxHoldersAbi, functionName: "getMaxHolders", args: [compliance] },
          { address: p.modules.maxHolders, abi: maxHoldersAbi, functionName: "getHolderCount", args: [compliance] },
          { address: p.modules.lockUp, abi: lockUpAbi, functionName: "getLockedUntil", args: [compliance] },
          { address: p.modules.supplyLimit, abi: supplyLimitAbi, functionName: "getSupplyLimit", args: [compliance] },
        ]
      : [],
    query: { enabled: !!compliance },
  });
  const supplyLimit = rules.data?.[3]?.result as bigint | undefined;
  return {
    isLoading: base.isLoading,
    refetch: () => {
      base.refetch();
      rules.refetch();
    },
    name: base.data?.[0].result as string | undefined,
    symbol: base.data?.[1].result as string | undefined,
    decimals: (base.data?.[2].result as number | undefined) ?? 0,
    totalSupply: base.data?.[3].result as bigint | undefined,
    paused: base.data?.[4].result as boolean | undefined,
    record,
    preset: record ? PRESETS[record.preset] : undefined,
    assetInfo: base.data?.[6].result as
      | {
          assetType: string;
          jurisdiction: string;
          description: string;
          legalEntity: string;
          valuation: bigint;
          valuationCurrency: string;
          valuationTimestamp: bigint;
          metadataURI: string;
        }
      | undefined,
    maxBalance: base.data?.[7].result as bigint | undefined,
    maxHolders: rules.data?.[0]?.result as bigint | undefined,
    holderCount: rules.data?.[1]?.result as bigint | undefined,
    lockedUntil: rules.data?.[2]?.result as bigint | undefined,
    supplyLimit: supplyLimit === MAX_UINT ? 0n : supplyLimit,
  };
}

export function formatAmount(value: bigint | undefined, decimals: number) {
  if (value === undefined) return "…";
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatValuation(value: bigint | undefined, currency: string | undefined) {
  if (value === undefined) return "…";
  const major = Number(value) / 100;
  return `${major.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

/** One token as a row: name and symbol, asset type, valuation, holders. */
export function TokenCard({ address }: { address: Address }) {
  const t = useTokenSummary(address);
  return (
    <li className="border-t" style={{ borderColor: "var(--line)" }}>
      <Link
        href={`/token?address=${address}`}
        className="grid grid-cols-1 gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_110px] sm:items-baseline"
        style={{ borderBottom: 0 }}
      >
        <span>
          <span style={{ color: "var(--ink)" }}>{t.name ?? "…"}</span>
          <span className="muted ml-2">{t.symbol}</span>
        </span>
        <span style={{ color: "var(--mid)" }}>{t.preset?.name ?? "…"}</span>
        <span style={{ color: "var(--mid)" }}>
          {formatValuation(t.assetInfo?.valuation, t.assetInfo?.valuationCurrency)}
        </span>
        <span className="muted sm:text-right">
          {t.paused ? (
            <span className="badge badge-alert">paused</span>
          ) : (
            <>
              {t.holderCount?.toString() ?? "…"}
              {t.maxHolders ? ` / ${t.maxHolders}` : ""} holders
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

export function TokenList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="border-b" style={{ borderColor: "var(--line)" }}>
      {children}
    </ul>
  );
}
