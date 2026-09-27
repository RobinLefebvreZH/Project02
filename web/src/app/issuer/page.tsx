"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { keccak256, parseEventLogs, parseUnits, stringToHex, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { platformAbi } from "@/abi/platformAbi";
import { PlatformGuard, usePlatform } from "@/components/PlatformGuard";
import { TokenCard, TokenList } from "@/components/TokenCard";
import { Field, Notice, TxStatus } from "@/components/ui";
import { useTx } from "@/lib/hooks";
import { CLAIM_TOPICS, PRESETS } from "@/lib/swiss";
import { parseCountries } from "@/lib/countries";

const ISSUER_ROLE = keccak256(stringToHex("ISSUER_ROLE"));

const empty = {
  name: "",
  symbol: "",
  decimals: "0",
  preset: "0",
  maxHolders: "",
  lockUpUntil: "",
  maxBalance: "",
  supplyLimit: "",
  extraCountries: "",
  jurisdiction: "CH",
  description: "",
  legalEntity: "",
  valuation: "",
  valuationCurrency: "CHF",
  metadataURI: "",
};

function CreateTokenForm({ onCreated }: { onCreated: () => void }) {
  const { platform } = usePlatform();
  const [f, setF] = useState(empty);
  const [created, setCreated] = useState<Address>();
  const [formError, setFormError] = useState<string>();
  const tx = useTx();
  const preset = PRESETS[Number(f.preset)];
  const extra = useMemo(() => parseCountries(f.extraCountries), [f.extraCountries]);
  const set =
    (k: keyof typeof empty) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setCreated(undefined);
    let args;
    try {
      const decimals = Number(f.decimals);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("Decimals must be 0–18.");
      const maxHolders = f.maxHolders ? Number(f.maxHolders) : 0;
      if (maxHolders > preset.maxHolders) throw new Error(`Max holders can't exceed ${preset.maxHolders} for this asset type.`);
      if (extra.unknown.length) throw new Error(`Unknown country code: ${extra.unknown.join(", ")}`);
      args = {
        name: f.name.trim(),
        symbol: f.symbol.trim().toUpperCase(),
        decimals,
        preset: preset.id,
        maxHolders,
        lockUpUntil: f.lockUpUntil ? BigInt(Math.floor(new Date(f.lockUpUntil).getTime() / 1000)) : 0n,
        maxBalance: f.maxBalance ? parseUnits(f.maxBalance, decimals) : 0n,
        supplyLimit: f.supplyLimit ? parseUnits(f.supplyLimit, decimals) : 0n,
        extraRestrictedCountries: extra.codes,
        assetInfo: {
          assetType: preset.assetType,
          jurisdiction: f.jurisdiction.trim(),
          description: f.description.trim(),
          legalEntity: f.legalEntity.trim(),
          valuation: f.valuation ? parseUnits(f.valuation, 2) : 0n,
          valuationCurrency: f.valuationCurrency.trim().toUpperCase(),
          valuationTimestamp: 0n,
          metadataURI: f.metadataURI.trim(),
        },
      };
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Invalid input.");
      return;
    }
    const receipt = await tx.send({ address: platform, abi: platformAbi, functionName: "createToken", args: [args] });
    if (receipt) {
      const [log] = parseEventLogs({ abi: platformAbi, eventName: "TokenCreated", logs: receipt.logs });
      if (log) setCreated(log.args.token);
      setF(empty);
      onCreated();
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <h3>create a token</h3>

      <Field label="Asset type">
        <select className="input" value={f.preset} onChange={set("preset")}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="text-[11px]" style={{ color: "var(--mid)" }}>
        <p>{preset.summary}</p>
        <p className="mt-2">
          <span className="label-caps mr-2">enforced</span>
          {preset.holderRule} · claims: {preset.claims.map((c) => CLAIM_TOPICS[c].short).join(" + ")} · sanctioned
          countries blocked
        </p>
        <p className="mt-1">
          <span className="label-caps mr-2">legal basis</span>
          {preset.refs.map((r, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <a href={r.href} target="_blank" rel="noreferrer">
                {r.law} {r.article}
              </a>
            </span>
          ))}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Token name" hint="Must be unique on the platform.">
          <input className="input" required value={f.name} onChange={set("name")} placeholder="Bahnhofstrasse 42" />
        </Field>
        <Field label="Symbol" hint="Must be unique on the platform.">
          <input className="input" required maxLength={11} value={f.symbol} onChange={set("symbol")} placeholder="BHF42" />
        </Field>
        <Field label="Decimals" hint="0 for indivisible shares.">
          <input className="input" type="number" min={0} max={18} value={f.decimals} onChange={set("decimals")} />
        </Field>
        <Field label="Max holders" hint={`Leave empty for the preset limit (${preset.maxHolders}).`}>
          <input className="input" type="number" min={1} max={preset.maxHolders} value={f.maxHolders} onChange={set("maxHolders")} />
        </Field>
      </div>

      <h4 className="pt-2">optional rules</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lock-up until" hint="No transfers between investors before this date.">
          <input className="input" type="date" value={f.lockUpUntil} onChange={set("lockUpUntil")} />
        </Field>
        <Field label="Max balance per investor" hint="Leave empty for no limit.">
          <input className="input" inputMode="decimal" value={f.maxBalance} onChange={set("maxBalance")} />
        </Field>
        <Field label="Maximum supply" hint="Leave empty for no cap.">
          <input className="input" inputMode="decimal" value={f.supplyLimit} onChange={set("supplyLimit")} />
        </Field>
        <Field label="Also restrict countries" hint="ISO codes, e.g. US, GB. Sanctioned countries are always restricted.">
          <input className="input" value={f.extraCountries} onChange={set("extraCountries")} placeholder="US" />
        </Field>
      </div>

      <h4 className="pt-2">underlying asset</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal entity / SPV">
          <input className="input" value={f.legalEntity} onChange={set("legalEntity")} placeholder="BHF42 Immobilien AG" />
        </Field>
        <Field label="Jurisdiction">
          <input className="input" value={f.jurisdiction} onChange={set("jurisdiction")} />
        </Field>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Field label="Valuation">
            <input className="input" inputMode="decimal" value={f.valuation} onChange={set("valuation")} placeholder="25000000" />
          </Field>
          <Field label="Currency">
            <input className="input" maxLength={3} value={f.valuationCurrency} onChange={set("valuationCurrency")} />
          </Field>
        </div>
        <Field label="Metadata URI (optional)">
          <input className="input mono" value={f.metadataURI} onChange={set("metadataURI")} placeholder="ipfs://…" />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="input" rows={2} value={f.description} onChange={set("description")} />
      </Field>

      <button className="btn" type="submit" disabled={tx.pending}>
        {tx.pending ? "Creating…" : "Create token"}
      </button>
      {formError && <p className="alert">{formError}</p>}
      <TxStatus {...tx} successText="Token created. It starts paused: unpause it when you're ready to issue." />
      {created && (
        <p>
          <Link href={`/token?address=${created}`}>Open the new token</Link> to unpause it, mint and attach documents.
        </p>
      )}
    </form>
  );
}

function IssuerPanel() {
  const { platform } = usePlatform();
  const { address } = useAccount();
  const { data: isIssuer } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "hasRole",
    args: address ? [ISSUER_ROLE, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: mine, refetch } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "tokensOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  if (!address) return <Notice>Connect your wallet to create and manage tokens.</Notice>;

  return (
    <div className="space-y-16">
      {isIssuer === false ? (
        <Notice>
          The connected wallet <span className="mono">{address}</span> is not an approved issuer. The platform admin
          can approve it on the Admin page.
        </Notice>
      ) : (
        <CreateTokenForm onCreated={() => refetch()} />
      )}
      <section className="space-y-3">
        <h2>your tokens</h2>
        {mine?.length ? (
          <TokenList>
            {[...mine].reverse().map((t) => (
              <TokenCard key={t} address={t} />
            ))}
          </TokenList>
        ) : (
          <p className="muted">You haven&apos;t created any tokens yet.</p>
        )}
      </section>
    </div>
  );
}

export default function IssuerPage() {
  return (
    <div>
      <h2 className="mb-9">issuer</h2>
      <PlatformGuard>
        <IssuerPanel />
      </PlatformGuard>
    </div>
  );
}
