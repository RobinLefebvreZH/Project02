"use client";

import { useState } from "react";
import {
  encodeAbiParameters,
  hexToString,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSignMessage } from "wagmi";
import { platformAbi } from "@/abi/platformAbi";
import { identityStorageAbi } from "@/abi/identityStorageAbi";
import { identityAbi } from "@/abi/identityAbi";
import { claimIssuerAbi } from "@/abi/claimIssuerAbi";
import { PlatformGuard, usePlatform } from "@/components/PlatformGuard";
import { AddressLink, Field, Notice, TxStatus } from "@/components/ui";
import { errorMessage, useTx } from "@/lib/hooks";
import { CLAIM_TOPICS } from "@/lib/swiss";
import { COUNTRIES, countryName } from "@/lib/countries";

const OFFICER_ROLE = keccak256(stringToHex("COMPLIANCE_OFFICER_ROLE"));
const ZERO = "0x0000000000000000000000000000000000000000";

function CountrySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} ({c.iso2})
        </option>
      ))}
    </select>
  );
}

function Onboard({ onDone }: { onDone: (wallet: Address) => void }) {
  const { platform } = usePlatform();
  const client = usePublicClient();
  const { address: officer } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [wallet, setWallet] = useState("");
  const [country, setCountry] = useState(756);
  const [topics, setTopics] = useState<number[]>([1]);
  const [step, setStep] = useState<string>();
  const [signError, setSignError] = useState<string>();
  const tx = useTx(() => onDone(wallet as Address));

  const toggle = (t: number) => setTopics((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t].sort()));

  async function run() {
    setSignError(undefined);
    try {
      setStep("Predicting the investor's identity address…");
      const identity = (await client!.readContract({
        address: platform,
        abi: platformAbi,
        functionName: "predictIdentity",
        args: [wallet as Address],
      })) as Address;
      const date = new Date().toISOString().slice(0, 10);
      const sigs: Hex[] = [];
      const datas: Hex[] = [];
      for (const [i, t] of topics.entries()) {
        setStep(`Sign claim ${i + 1} of ${topics.length} in your wallet: ${CLAIM_TOPICS[t].name}`);
        const data = stringToHex(`${CLAIM_TOPICS[t].name} · ${date} · ${officer}`);
        const hash = keccak256(
          encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [identity, BigInt(t), data]),
        );
        sigs.push(await signMessageAsync({ message: { raw: hash } }));
        datas.push(data);
      }
      setStep(undefined);
      await tx.send({
        address: platform,
        abi: platformAbi,
        functionName: "onboardInvestor",
        args: [wallet, country, topics.map(BigInt), sigs, datas],
      });
    } catch (e) {
      setStep(undefined);
      setSignError(errorMessage(e));
    }
  }

  return (
    <div className="card">
      <h3>onboard an investor</h3>
      <p>
        Creates the investor&apos;s ONCHAINID, attaches the claims you sign, and registers them for every token on the
        platform. Only issue a claim after checking the underlying documents.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Investor wallet">
          <input className="input mono" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} placeholder="0x…" />
        </Field>
        <Field label="Country of residence">
          <CountrySelect value={country} onChange={setCountry} />
        </Field>
      </div>
      <div>
        <span className="label">Claims you attest</span>
        <div className="space-y-2">
          {Object.entries(CLAIM_TOPICS).map(([id, c]) => {
            const t = Number(id);
            return (
              <label key={id} className="flex items-baseline gap-2">
                <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(t)} disabled={t === 1} />
                <span>
                  {c.name}{" "}
                  <a className="muted text-[11px]" href={c.ref.href} target="_blank" rel="noreferrer">
                    {c.ref.law} {c.ref.article}
                  </a>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <button className="btn" disabled={!isAddress(wallet) || tx.pending || !!step} onClick={run}>
        Sign claims &amp; onboard
      </button>
      {step && <p className="muted">{step}</p>}
      {signError && <p className="alert">{signError}</p>}
      <TxStatus {...tx} successText="Investor onboarded. They can now receive tokens whose rules they meet." />
    </div>
  );
}

function Investor({ wallet, isOfficer }: { wallet: Address; isOfficer: boolean }) {
  const p = usePlatform();
  const { data: base, refetch } = useReadContracts({
    contracts: [
      { address: p.identityStorage, abi: identityStorageAbi, functionName: "storedIdentity", args: [wallet] },
      { address: p.identityStorage, abi: identityStorageAbi, functionName: "storedInvestorCountry", args: [wallet] },
    ],
  });
  const identity = base?.[0].result as Address | undefined;
  const country = base?.[1].result as number | undefined;
  const topicIds = Object.keys(CLAIM_TOPICS).map(Number);
  const claimIds = topicIds.map((t) =>
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [p.claimIssuer, BigInt(t)])),
  );
  const { data: claims, refetch: refetchClaims } = useReadContracts({
    contracts:
      identity && identity !== ZERO
        ? claimIds.map((id) => ({ address: identity, abi: identityAbi, functionName: "getClaim", args: [id] }) as const)
        : [],
    query: { enabled: !!identity && identity !== ZERO },
  });
  const claimRows = topicIds.map((t, i) => {
    const r = claims?.[i]?.result as readonly [bigint, bigint, Address, Hex, Hex, string] | undefined;
    return { topic: t, sig: r?.[3], data: r?.[4], present: !!r && r[2] !== ZERO };
  });
  const { data: validity, refetch: refetchValidity } = useReadContracts({
    contracts: claimRows.map(
      (c) =>
        ({
          address: p.claimIssuer,
          abi: claimIssuerAbi,
          functionName: "isClaimValid",
          args: [identity!, BigInt(c.topic), c.sig ?? "0x", c.data ?? "0x"],
        }) as const,
    ),
    query: { enabled: !!identity && identity !== ZERO && claimRows.some((c) => c.present) },
  });

  const refreshAll = () => {
    refetch();
    refetchClaims().then(() => refetchValidity());
  };
  const revokeTx = useTx(refreshAll);
  const countryTx = useTx(refreshAll);
  const recoveryTx = useTx();
  const [newCountry, setNewCountry] = useState(756);
  const [recoveryWallet, setRecoveryWallet] = useState("");

  if (!base) return <p className="muted">Loading…</p>;
  if (!identity || identity === ZERO) return <Notice>This wallet has not been onboarded.</Notice>;

  return (
    <div className="card">
      <h3>investor</h3>
      <dl className="grid gap-x-12 sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-b py-2" style={{ borderColor: "var(--line)" }}>
          <dt className="muted">Identity (ONCHAINID)</dt>
          <dd>
            <AddressLink address={identity} />
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b py-2" style={{ borderColor: "var(--line)" }}>
          <dt className="muted">Country</dt>
          <dd>{country !== undefined ? countryName(country) : "…"}</dd>
        </div>
      </dl>
      <ul>
        {claimRows.map((c, i) => {
          const valid = validity?.[i]?.result === true;
          return (
            <li key={c.topic} className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2" style={{ borderColor: "var(--line)" }}>
              <span>
                {CLAIM_TOPICS[c.topic].name}
                {c.present && c.data && (
                  <span className="muted ml-2 text-[11px]">{safeString(c.data)}</span>
                )}
              </span>
              <span className="flex items-baseline gap-3">
                <span className={`badge ${c.present && !valid ? "badge-alert" : ""}`}>
                  {!c.present ? "none" : valid ? "valid" : "revoked"}
                </span>
                {isOfficer && c.present && valid && (
                  <button
                    className="btn btn-danger"
                    disabled={revokeTx.pending}
                    onClick={() =>
                      revokeTx.send({ address: p.platform, abi: platformAbi, functionName: "revokeInvestorClaim", args: [wallet, BigInt(c.topic)] })
                    }
                  >
                    Revoke
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <TxStatus {...revokeTx} successText="Claim revoked. The investor is blocked on every token requiring it." />
      <p className="muted text-[11px]">
        To add a missing claim, onboard the same wallet again with that claim ticked.
      </p>

      {isOfficer && (
        <>
          <h4 className="pt-2">change country</h4>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <CountrySelect value={newCountry} onChange={setNewCountry} />
            <button
              className="btn btn-secondary"
              disabled={countryTx.pending}
              onClick={() => countryTx.send({ address: p.platform, abi: platformAbi, functionName: "setInvestorCountry", args: [wallet, newCountry] })}
            >
              Update country
            </button>
          </div>
          <TxStatus {...countryTx} successText="Country updated." />

          <h4 className="pt-2">lost wallet</h4>
          <p>
            Link a replacement wallet to this identity. The token&apos;s issuer then runs <em>Recover wallet</em> on the
            token page to move the balance.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="New wallet">
              <input className="input mono" value={recoveryWallet} onChange={(e) => setRecoveryWallet(e.target.value.trim())} placeholder="0x…" />
            </Field>
            <button
              className="btn btn-secondary"
              disabled={!isAddress(recoveryWallet) || recoveryTx.pending}
              onClick={() => recoveryTx.send({ address: p.platform, abi: platformAbi, functionName: "addRecoveryWallet", args: [identity, recoveryWallet] })}
            >
              Add recovery wallet
            </button>
          </div>
          <TxStatus {...recoveryTx} successText="Recovery wallet linked." />
        </>
      )}
    </div>
  );
}

function safeString(h: Hex) {
  try {
    return hexToString(h);
  } catch {
    return "";
  }
}

function Desk() {
  const { platform } = usePlatform();
  const { address } = useAccount();
  const { data: isOfficer } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "hasRole",
    args: address ? [OFFICER_ROLE, address] : undefined,
    query: { enabled: !!address },
  });
  const [lookup, setLookup] = useState("");
  const [shown, setShown] = useState<Address>();

  return (
    <div className="space-y-16">
      {!address ? (
        <Notice>Connect your wallet. Compliance officers can onboard investors here.</Notice>
      ) : isOfficer ? (
        <Onboard onDone={(w) => { setLookup(w); setShown(w); }} />
      ) : (
        <Notice>
          The connected wallet is not a compliance officer. You can still look up any investor below.
        </Notice>
      )}

      <section className="space-y-4">
        <h2>look up an investor</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Wallet">
            <input className="input mono" value={lookup} onChange={(e) => setLookup(e.target.value.trim())} placeholder="0x…" />
          </Field>
          <button className="btn btn-secondary" disabled={!isAddress(lookup)} onClick={() => setShown(lookup as Address)}>
            Look up
          </button>
        </div>
        {shown && <Investor key={shown} wallet={shown} isOfficer={!!isOfficer} />}
      </section>
    </div>
  );
}

export default function InvestorsPage() {
  return (
    <div>
      <h2 className="mb-9">investors · kyc desk</h2>
      <PlatformGuard>
        <Desk />
      </PlatformGuard>
    </div>
  );
}
