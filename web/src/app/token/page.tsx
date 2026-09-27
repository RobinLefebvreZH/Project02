"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { hexToString, isAddress, keccak256, parseUnits, stringToHex, type Address, type Hex } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { tokenAbi } from "@/abi/tokenAbi";
import { platformAbi } from "@/abi/platformAbi";
import { assetRegistryAbi } from "@/abi/assetRegistryAbi";
import { identityRegistryAbi } from "@/abi/identityRegistryAbi";
import { identityStorageAbi } from "@/abi/identityStorageAbi";
import { countryRestrictAbi } from "@/abi/countryRestrictAbi";
import { PlatformGuard, usePlatform } from "@/components/PlatformGuard";
import { formatAmount, formatValuation, useTokenSummary } from "@/components/TokenCard";
import { AddressLink, Field, Notice, TxStatus } from "@/components/ui";
import { ipfsToHttp } from "@/lib/config";
import { useTx } from "@/lib/hooks";
import { CLAIM_TOPICS } from "@/lib/swiss";
import { COUNTRIES, parseCountries } from "@/lib/countries";

// Off in the static (OVH) build: uploading needs a server to keep the Pinata key secret.
const UPLOADS_ENABLED = process.env.NEXT_PUBLIC_UPLOADS_ENABLED !== "false";
const ADMIN_ROLE = ("0x" + "00".repeat(32)) as Hex;
const ZERO_BYTES32 = ADMIN_ROLE;
const MAX_UINT = 2n ** 256n - 1n;

type Summary = ReturnType<typeof useTokenSummary>;

function docName(b: Hex) {
  try {
    return hexToString(b, { size: 32 }).replace(/\0+$/, "");
  } catch {
    return b;
  }
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2" style={{ borderColor: "var(--line)" }}>
      <dt className="muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- overview & rules

function Overview({ token, t }: { token: Address; t: Summary }) {
  const info = t.assetInfo;
  const updated = info?.valuationTimestamp ? new Date(Number(info.valuationTimestamp) * 1000).toLocaleDateString() : "—";
  return (
    <section>
      <h2 className="mb-9">
        {(t.preset?.name ?? "asset").toLowerCase()} · {t.symbol ?? "…"}
        {t.paused && <span className="badge badge-alert ml-3">transfers paused</span>}
      </h2>
      <h1 className="lead">
        {t.name ?? "…"}
        {info?.description && <span className="q"> — {info.description}</span>}
      </h1>
      <p className="muted mt-3 text-[11px]">
        ERC-3643 token <AddressLink address={token} />
      </p>
      <dl className="mt-12 grid gap-x-12 sm:grid-cols-2">
        <Row k="Total supply" v={formatAmount(t.totalSupply, t.decimals)} />
        <Row k="Valuation" v={formatValuation(info?.valuation, info?.valuationCurrency)} />
        <Row k="Legal entity" v={info?.legalEntity || "—"} />
        <Row k="Valuation date" v={updated} />
        <Row k="Jurisdiction" v={info?.jurisdiction || "—"} />
        <Row
          k="Metadata"
          v={info?.metadataURI ? <a href={ipfsToHttp(info.metadataURI)} target="_blank" rel="noreferrer">open</a> : "—"}
        />
      </dl>
    </section>
  );
}

function useRestrictedCountries(compliance?: Address) {
  const p = usePlatform();
  const { data, refetch } = useReadContracts({
    contracts: compliance
      ? COUNTRIES.map(
          (c) =>
            ({ address: p.modules.countryRestrict, abi: countryRestrictAbi, functionName: "isCountryRestricted", args: [compliance, c.code] }) as const,
        )
      : [],
    query: { enabled: !!compliance },
  });
  const list = useMemo(() => COUNTRIES.filter((_, i) => data?.[i]?.result === true), [data]);
  return { list, refetch };
}

function Rules({ t, restricted }: { t: Summary; restricted: { name: string; iso2: string }[] }) {
  const { platform } = usePlatform();
  const { data: preset } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "getPreset",
    args: t.record ? [t.record.preset] : undefined,
    query: { enabled: !!t.record },
  });
  const lock = t.lockedUntil && t.lockedUntil > 0n ? new Date(Number(t.lockedUntil) * 1000) : undefined;
  return (
    <div className="card">
      <h3>rules enforced</h3>
      <dl>
        <Row k="Holders" v={`${t.holderCount?.toString() ?? "…"} of max ${t.maxHolders?.toString() ?? "…"}`} />
        <Row
          k="Required investor claims"
          v={preset ? preset.claimTopics.map((c) => CLAIM_TOPICS[Number(c)]?.name ?? `topic ${c}`).join(" · ") : "…"}
        />
        <Row k="Lock-up" v={lock ? (lock > new Date() ? `until ${lock.toLocaleDateString()}` : `ended ${lock.toLocaleDateString()}`) : "none"} />
        <Row k="Max balance per investor" v={t.maxBalance ? formatAmount(t.maxBalance, t.decimals) : "none"} />
        <Row k="Maximum supply" v={t.supplyLimit ? formatAmount(t.supplyLimit, t.decimals) : "none"} />
        <Row k="Restricted countries" v={restricted.length ? restricted.map((c) => c.iso2).join(", ") : "…"} />
      </dl>
      {t.preset && (
        <p className="text-[11px]">
          <span className="label-caps mr-2">legal basis</span>
          {t.preset.refs.map((r, i) => (
            <span key={i}>
              {i > 0 && " · "}
              <a href={r.href} target="_blank" rel="noreferrer">
                {r.law} {r.article}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- documents

function useDocuments(token: Address) {
  const { assetRegistry } = usePlatform();
  const { data: names, refetch } = useReadContract({ address: assetRegistry, abi: assetRegistryAbi, functionName: "getAllDocuments", args: [token] });
  const { data: docs, refetch: refetchDocs } = useReadContracts({
    contracts: (names ?? []).map((n) => ({ address: assetRegistry, abi: assetRegistryAbi, functionName: "getDocument", args: [token, n] }) as const),
    query: { enabled: !!names?.length },
  });
  const list = (names ?? []).map((n, i) => {
    const r = docs?.[i]?.result as { uri: string; hash: Hex; timestamp: bigint } | undefined;
    return { key: n, name: docName(n), uri: r?.uri, hash: r?.hash, timestamp: r?.timestamp };
  });
  return { list, refetch: () => refetch().then(() => refetchDocs()) };
}

function Documents({ docs }: { docs: ReturnType<typeof useDocuments>["list"] }) {
  return (
    <div className="card">
      <h3>legal documents</h3>
      {!docs.length && <p>No documents attached yet.</p>}
      {docs.map((d) => (
        <div key={d.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span>{d.name}</span>
            {d.uri && <a href={ipfsToHttp(d.uri)} target="_blank" rel="noreferrer">view document</a>}
          </div>
          <div className="muted mono text-[11px]">keccak256: {d.hash}</div>
          {d.timestamp ? <div className="muted text-[11px]">Updated {new Date(Number(d.timestamp) * 1000).toLocaleString()}</div> : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- holder view

function MyPosition({ token, t }: { token: Address; t: Summary }) {
  const { address } = useAccount();
  const c = { address: token, abi: tokenAbi } as const;
  const ir = t.record?.identityRegistry;
  const { data, refetch } = useReadContracts({
    contracts:
      address && ir
        ? [
            { ...c, functionName: "balanceOf", args: [address] },
            { ...c, functionName: "isFrozen", args: [address] },
            { ...c, functionName: "getFrozenTokens", args: [address] },
            { address: ir, abi: identityRegistryAbi, functionName: "isVerified", args: [address] },
          ]
        : [],
    query: { enabled: !!address && !!ir },
  });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx(() => {
    refetch();
    t.refetch();
  });
  if (!address) return null;
  const balance = data?.[0]?.result as bigint | undefined;
  const frozen = data?.[1]?.result as boolean | undefined;
  const frozenTokens = data?.[2]?.result as bigint | undefined;
  const verified = data?.[3]?.result as boolean | undefined;

  return (
    <div className="card">
      <h3>your position</h3>
      <p>
        Balance <strong style={{ color: "var(--ink)" }}>{formatAmount(balance, t.decimals)}</strong> {t.symbol}
        <span className={`badge ml-3 ${verified === false ? "badge-alert" : ""}`}>{verified ? "eligible investor" : "not eligible"}</span>
        {frozen && <span className="badge badge-alert ml-3">wallet frozen</span>}
        {!!frozenTokens && frozenTokens > 0n && <span className="badge ml-3">{formatAmount(frozenTokens, t.decimals)} frozen</span>}
      </p>
      {!!balance && balance > 0n && (
        <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <Field label="Send to">
            <input className="input mono" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" />
          </Field>
          <Field label="Amount">
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <button className="btn" disabled={!isAddress(to) || !amount || tx.pending} onClick={() => tx.send({ ...c, functionName: "transfer", args: [to, parseUnits(amount, t.decimals)] })}>
            Transfer
          </button>
        </div>
      )}
      <TxStatus {...tx} successText="Transfer complete." />
    </div>
  );
}

// ---------------------------------------------------------------- agent tools (ERC-3643 token functions)

function AddrAmount({ label, amountLabel = "Amount", onAddr, onAmount, addr, amount }: {
  label: string; amountLabel?: string; addr: string; amount: string; onAddr: (v: string) => void; onAmount: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
      <Field label={label}>
        <input className="input mono" value={addr} onChange={(e) => onAddr(e.target.value.trim())} placeholder="0x…" />
      </Field>
      <Field label={amountLabel}>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} />
      </Field>
    </div>
  );
}

function SupplyTools({ token, t }: { token: Address; t: Summary }) {
  const c = { address: token, abi: tokenAbi } as const;
  const [addr, setAddr] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx(t.refetch);
  const pauseTx = useTx(t.refetch);
  const ok = isAddress(addr) && !!amount;
  const amt = () => parseUnits(amount, t.decimals);
  return (
    <div className="card">
      <h3>issuance</h3>
      <div className="flex items-center justify-between gap-2">
        <p>
          Token is <strong style={{ color: "var(--ink)" }}>{t.paused ? "paused" : "active"}</strong>.
          {t.paused && " New tokens start paused: unpause to allow minting and transfers."}
        </p>
        <button className={t.paused ? "btn" : "btn btn-danger"} disabled={pauseTx.pending} onClick={() => pauseTx.send({ ...c, functionName: t.paused ? "unpause" : "pause" })}>
          {t.paused ? "Unpause" : "Pause"}
        </button>
      </div>
      <TxStatus {...pauseTx} successText="Updated." />
      <p>Mint to eligible investors on subscription. Burn on redemption.</p>
      <AddrAmount label="Investor" addr={addr} amount={amount} onAddr={setAddr} onAmount={setAmount} />
      <div className="flex gap-2">
        <button className="btn" disabled={!ok || tx.pending} onClick={() => tx.send({ ...c, functionName: "mint", args: [addr, amt()] })}>Mint</button>
        <button className="btn btn-secondary" disabled={!ok || tx.pending} onClick={() => tx.send({ ...c, functionName: "burn", args: [addr, amt()] })}>Burn</button>
      </div>
      <TxStatus {...tx} successText="Supply updated." />
    </div>
  );
}

function EnforcementTools({ token, t }: { token: Address; t: Summary }) {
  const p = usePlatform();
  const c = { address: token, abi: tokenAbi } as const;
  const [addr, setAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [lost, setLost] = useState("");
  const [fresh, setFresh] = useState("");
  const freezeTx = useTx(t.refetch);
  const forceTx = useTx(t.refetch);
  const recTx = useTx(t.refetch);
  const { data: lostId } = useReadContract({
    address: p.identityStorage,
    abi: identityStorageAbi,
    functionName: "storedIdentity",
    args: isAddress(lost) ? [lost as Address] : undefined,
    query: { enabled: isAddress(lost) },
  });
  const valid = isAddress(addr);
  return (
    <div className="card">
      <h3>enforcement</h3>
      <AddrAmount label="Wallet" amountLabel="Tokens (partial freeze)" addr={addr} amount={amount} onAddr={setAddr} onAmount={setAmount} />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-secondary" disabled={!valid || freezeTx.pending} onClick={() => freezeTx.send({ ...c, functionName: "setAddressFrozen", args: [addr, true] })}>Freeze wallet</button>
        <button className="btn btn-secondary" disabled={!valid || freezeTx.pending} onClick={() => freezeTx.send({ ...c, functionName: "setAddressFrozen", args: [addr, false] })}>Unfreeze wallet</button>
        <button className="btn btn-secondary" disabled={!valid || !amount || freezeTx.pending} onClick={() => freezeTx.send({ ...c, functionName: "freezePartialTokens", args: [addr, parseUnits(amount, t.decimals)] })}>Freeze tokens</button>
        <button className="btn btn-secondary" disabled={!valid || !amount || freezeTx.pending} onClick={() => freezeTx.send({ ...c, functionName: "unfreezePartialTokens", args: [addr, parseUnits(amount, t.decimals)] })}>Unfreeze tokens</button>
      </div>
      <TxStatus {...freezeTx} successText="Freeze status updated." />

      <h4 className="pt-2">forced transfer</h4>
      <p>Moves tokens without the holder&apos;s signature (court order, error). The receiver must be an eligible investor.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px]">
        <Field label="From"><input className="input mono" value={from} onChange={(e) => setFrom(e.target.value.trim())} placeholder="0x…" /></Field>
        <Field label="To"><input className="input mono" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" /></Field>
        <Field label="Amount"><input className="input" inputMode="decimal" value={fAmount} onChange={(e) => setFAmount(e.target.value)} /></Field>
      </div>
      <button className="btn btn-danger" disabled={!isAddress(from) || !isAddress(to) || !fAmount || forceTx.pending} onClick={() => forceTx.send({ ...c, functionName: "forcedTransfer", args: [from, to, parseUnits(fAmount, t.decimals)] })}>
        Force transfer
      </button>
      <TxStatus {...forceTx} successText="Tokens moved." />

      <h4 className="pt-2">recover a lost wallet</h4>
      <p>A compliance officer first links the new wallet to the investor&apos;s identity (Investors page).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Lost wallet"><input className="input mono" value={lost} onChange={(e) => setLost(e.target.value.trim())} placeholder="0x…" /></Field>
        <Field label="New wallet"><input className="input mono" value={fresh} onChange={(e) => setFresh(e.target.value.trim())} placeholder="0x…" /></Field>
      </div>
      <button
        className="btn btn-secondary"
        disabled={!isAddress(lost) || !isAddress(fresh) || !lostId || recTx.pending}
        onClick={() => recTx.send({ ...c, functionName: "recoveryAddress", args: [lost, fresh, lostId] })}
      >
        Recover wallet
      </button>
      <TxStatus {...recTx} successText="Balance, freezes and identity moved to the new wallet." />
    </div>
  );
}

// ---------------------------------------------------------------- issuer compliance settings (via platform)

function ComplianceSettings({ token, t, restricted, onChange }: { token: Address; t: Summary; restricted: { iso2: string }[]; onChange: () => void }) {
  const { platform } = usePlatform();
  const c = { address: platform, abi: platformAbi } as const;
  const [holders, setHolders] = useState("");
  const [lock, setLock] = useState("");
  const [maxBal, setMaxBal] = useState("");
  const [cap, setCap] = useState("");
  const [countries, setCountries] = useState("");
  const tx = useTx(() => {
    t.refetch();
    onChange();
  });
  const parsed = parseCountries(countries);
  const ceiling = t.preset?.maxHolders;
  return (
    <div className="card">
      <h3>compliance settings</h3>
      <p>Adjust within the limits of the {t.preset?.name.toLowerCase()} preset.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Max holders" hint={`Up to ${ceiling}. Currently ${t.maxHolders?.toString() ?? "…"}.`}>
          <input className="input" type="number" min={1} max={ceiling} value={holders} onChange={(e) => setHolders(e.target.value)} />
        </Field>
        <button className="btn btn-secondary" disabled={!holders || tx.pending} onClick={() => tx.send({ ...c, functionName: "setMaxHolders", args: [token, Number(holders)] })}>Set</button>
        <Field label="Lock-up until" hint="Empty = remove lock-up.">
          <input className="input" type="date" value={lock} onChange={(e) => setLock(e.target.value)} />
        </Field>
        <button className="btn btn-secondary" disabled={tx.pending} onClick={() => tx.send({ ...c, functionName: "setLockUp", args: [token, lock ? BigInt(Math.floor(new Date(lock).getTime() / 1000)) : 0n] })}>Set</button>
        <Field label="Max balance per investor" hint="Empty = no limit.">
          <input className="input" inputMode="decimal" value={maxBal} onChange={(e) => setMaxBal(e.target.value)} />
        </Field>
        <button className="btn btn-secondary" disabled={tx.pending} onClick={() => tx.send({ ...c, functionName: "setMaxBalance", args: [token, maxBal ? parseUnits(maxBal, t.decimals) : 0n] })}>Set</button>
        <Field label="Maximum supply" hint="Empty = no cap.">
          <input className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
        </Field>
        <button className="btn btn-secondary" disabled={tx.pending} onClick={() => tx.send({ ...c, functionName: "setSupplyLimit", args: [token, cap ? parseUnits(cap, t.decimals) : 0n] })}>Set</button>
      </div>
      <Field label="Countries" hint={`ISO codes, e.g. US, GB. Currently restricted: ${restricted.map((r) => r.iso2).join(", ") || "…"}`}>
        <input className="input" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="US" />
      </Field>
      {parsed.unknown.length > 0 && <p className="alert">Unknown: {parsed.unknown.join(", ")}</p>}
      <div className="flex gap-2">
        <button className="btn btn-secondary" disabled={!parsed.codes.length || tx.pending} onClick={() => tx.send({ ...c, functionName: "setCountriesRestricted", args: [token, parsed.codes, true] })}>Restrict</button>
        <button className="btn btn-secondary" disabled={!parsed.codes.length || tx.pending} onClick={() => tx.send({ ...c, functionName: "setCountriesRestricted", args: [token, parsed.codes, false] })}>Allow</button>
      </div>
      <TxStatus {...tx} successText="Compliance updated." />
    </div>
  );
}

// ---------------------------------------------------------------- asset data

function AssetTools({ token, t, docs, onDocs }: { token: Address; t: Summary; docs: ReturnType<typeof useDocuments>["list"]; onDocs: () => void }) {
  const { assetRegistry } = usePlatform();
  const c = { address: assetRegistry, abi: assetRegistryAbi } as const;
  const [valuation, setValuation] = useState("");
  const [cur, setCur] = useState(t.assetInfo?.valuationCurrency || "CHF");
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [hash, setHash] = useState<Hex>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const valTx = useTx(t.refetch);
  const docTx = useTx(onDocs);
  const nameOk = name.length > 0 && new TextEncoder().encode(name).length <= 32;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(undefined);
    setHash(keccak256(new Uint8Array(await file.arrayBuffer())));
    if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 32));
    if (!UPLOADS_ENABLED) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/ipfs", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setUri(json.uri);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card">
      <h3>asset &amp; documents</h3>
      <div className="grid gap-2 sm:grid-cols-[1fr_80px_auto] sm:items-end">
        <Field label="New valuation"><input className="input" inputMode="decimal" value={valuation} onChange={(e) => setValuation(e.target.value)} /></Field>
        <Field label="Currency"><input className="input" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} /></Field>
        <button className="btn btn-secondary" disabled={!valuation || valTx.pending} onClick={() => valTx.send({ ...c, functionName: "updateValuation", args: [token, parseUnits(valuation, 2), cur] })}>Update</button>
      </div>
      <TxStatus {...valTx} successText="Valuation updated." />

      <p>
        {UPLOADS_ENABLED
          ? "Choose a file to upload it to IPFS. Its keccak256 hash is computed in your browser and stored on-chain."
          : "Choose the file to compute its keccak256 hash in your browser, then paste its IPFS link (e.g. from app.pinata.cloud)."}
      </p>
      <input type="file" onChange={(e) => onFile(e.target.files?.[0])} />
      {uploading && <p className="muted">Uploading to IPFS…</p>}
      {uploadError && <p className="alert">{uploadError}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Document name" hint="Max 32 characters, e.g. prospectus, land-registry.">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="URI"><input className="input mono" value={uri} onChange={(e) => setUri(e.target.value.trim())} placeholder="ipfs://…" /></Field>
      </div>
      {hash && <p className="muted mono text-[11px]">keccak256: {hash}</p>}
      <button className="btn" disabled={!nameOk || !uri || docTx.pending || uploading} onClick={() => docTx.send({ ...c, functionName: "setDocument", args: [token, stringToHex(name, { size: 32 }), uri, hash ?? ZERO_BYTES32] })}>
        Save document on-chain
      </button>
      {docs.map((d) => (
        <div key={d.key} className="flex items-center justify-between gap-2">
          <span>{d.name}</span>
          <button className="btn btn-secondary" disabled={docTx.pending} onClick={() => docTx.send({ ...c, functionName: "removeDocument", args: [token, d.key] })}>Remove</button>
        </div>
      ))}
      <TxStatus {...docTx} successText="Documents updated." />
    </div>
  );
}

function AgentTools({ token }: { token: Address }) {
  const { platform } = usePlatform();
  const [addr, setAddr] = useState("");
  const tx = useTx();
  const valid = isAddress(addr);
  return (
    <div className="card">
      <h3>agents</h3>
      <p>Agents can mint, burn, freeze, pause, force transfers and recover wallets on this token.</p>
      <Field label="Agent wallet"><input className="input mono" value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="0x…" /></Field>
      <div className="flex gap-2">
        <button className="btn" disabled={!valid || tx.pending} onClick={() => tx.send({ address: platform, abi: platformAbi, functionName: "addTokenAgent", args: [token, addr] })}>Add agent</button>
        <button className="btn btn-secondary" disabled={!valid || tx.pending} onClick={() => tx.send({ address: platform, abi: platformAbi, functionName: "removeTokenAgent", args: [token, addr] })}>Remove agent</button>
      </div>
      <TxStatus {...tx} successText="Agents updated." />
    </div>
  );
}

function PlatformAdminTools({ token }: { token: Address }) {
  const { platform } = usePlatform();
  const tx = useTx();
  return (
    <div className="card">
      <h3>platform admin</h3>
      <p>Emergency stop of all transfers on this token, e.g. on a regulator&apos;s order. The issuer can unpause.</p>
      <button className="btn btn-danger" disabled={tx.pending} onClick={() => tx.send({ address: platform, abi: platformAbi, functionName: "emergencyPause", args: [token] })}>
        Emergency pause
      </button>
      <TxStatus {...tx} successText="Token paused." />
    </div>
  );
}

// ---------------------------------------------------------------- page

function TokenView() {
  const raw = useSearchParams().get("address") ?? "";
  const valid = isAddress(raw);
  const token = (valid ? raw : "0x0000000000000000000000000000000000000000") as Address;
  const p = usePlatform();
  const { address: account } = useAccount();
  const t = useTokenSummary(token);
  const docs = useDocuments(token);
  const restricted = useRestrictedCountries(t.record?.compliance);
  const { data: roles } = useReadContracts({
    contracts: account
      ? [
          { address: token, abi: tokenAbi, functionName: "isAgent", args: [account] },
          { address: p.platform, abi: platformAbi, functionName: "hasRole", args: [ADMIN_ROLE, account] },
        ]
      : [],
    query: { enabled: valid && !!account },
  });
  const isAgent = roles?.[0]?.result === true;
  const isPlatformAdmin = roles?.[1]?.result === true;
  const isIssuer = !!account && !!t.record && t.record.issuer.toLowerCase() === account.toLowerCase();

  if (!valid) return <Notice>Invalid token address.</Notice>;
  if (!t.isLoading && (!t.record || t.record.issuer === "0x0000000000000000000000000000000000000000")) {
    return <Notice>No platform token found at this address on the current network.</Notice>;
  }

  return (
    <div className="space-y-16">
      <Overview token={token} t={t} />
      <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
        <Rules t={t} restricted={restricted.list} />
        <Documents docs={docs.list} />
        <MyPosition token={token} t={t} />
      </div>
      {(isAgent || isIssuer) && (
        <section>
          <h2 className="mb-6">manage token</h2>
          <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
            {isAgent && <SupplyTools token={token} t={t} />}
            {isAgent && <EnforcementTools token={token} t={t} />}
            {isIssuer && <ComplianceSettings token={token} t={t} restricted={restricted.list} onChange={restricted.refetch} />}
            <AssetTools token={token} t={t} docs={docs.list} onDocs={docs.refetch} />
            {isIssuer && <AgentTools token={token} />}
          </div>
        </section>
      )}
      {isPlatformAdmin && <PlatformAdminTools token={token} />}
    </div>
  );
}

export default function TokenPage() {
  return (
    <PlatformGuard>
      <Suspense fallback={<Notice>Loading…</Notice>}>
        <TokenView />
      </Suspense>
    </PlatformGuard>
  );
}
