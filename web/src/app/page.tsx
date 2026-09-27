"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { platformAbi } from "@/abi/platformAbi";
import { PlatformGuard, usePlatform } from "@/components/PlatformGuard";
import { TokenCard, TokenList as Rows } from "@/components/TokenCard";
import { Notice } from "@/components/ui";

function TokenList() {
  const { platform } = usePlatform();
  const { data: tokens, isLoading, error } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "allTokens",
  });

  if (isLoading) return <Notice>Loading tokens…</Notice>;
  if (error) return <Notice>Could not read the platform: {error.message.split("\n")[0]}</Notice>;
  if (!tokens?.length) return <Notice>No tokens yet. Approved issuers can create one on the Issuer page.</Notice>;

  return (
    <Rows>
      {[...tokens].reverse().map((t) => (
        <TokenCard key={t} address={t} />
      ))}
    </Rows>
  );
}

export default function Home() {
  return (
    <div>
      <p className="lead mb-[22px]">
        ERC-3643 security tokens for Swiss real-world assets.{" "}
        <span className="q">
          Every holder has a verified on-chain identity, and each asset type enforces the investor rules of Swiss
          law: Lex Koller, the Banking Ordinance, FinSA and CISA.
        </span>
      </p>
      <p className="muted mb-16 text-[11px] tracking-[0.06em]">
        T-REX · ONCHAINID · Swiss presets —{" "}
        <Link href="/references" className="muted">
          see references
        </Link>
      </p>
      <h2 className="mb-5">tokens</h2>
      <PlatformGuard>
        <TokenList />
      </PlatformGuard>
    </div>
  );
}
