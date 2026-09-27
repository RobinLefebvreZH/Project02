"use client";

import { useState } from "react";
import { isAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { platformAbi } from "@/abi/platformAbi";
import { PlatformGuard, usePlatform } from "@/components/PlatformGuard";
import { AddressLink, Field, Notice, TxStatus } from "@/components/ui";
import { useTx } from "@/lib/hooks";
import { CLAIM_TOPICS, PRESETS } from "@/lib/swiss";
import { countryName } from "@/lib/countries";

const ADMIN_ROLE = ("0x" + "00".repeat(32)) as Hex;
const ISSUER_ROLE = keccak256(stringToHex("ISSUER_ROLE"));
const OFFICER_ROLE = keccak256(stringToHex("COMPLIANCE_OFFICER_ROLE"));

function RoleCheck({ role, account }: { role: Hex; account: Address }) {
  const { platform } = usePlatform();
  const { data } = useReadContract({ address: platform, abi: platformAbi, functionName: "hasRole", args: [role, account] });
  if (data === undefined) return null;
  return <span className="badge">{data ? "has role" : "no role"}</span>;
}

function RoleManager({ title, text, role, grant, revoke }: {
  title: string;
  text: string;
  role: Hex;
  grant: (a: string) => { functionName: string; args: readonly unknown[] };
  revoke: (a: string) => { functionName: string; args: readonly unknown[] };
}) {
  const { platform } = usePlatform();
  const [addr, setAddr] = useState("");
  const tx = useTx();
  const valid = isAddress(addr);
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{text}</p>
      <Field label="Wallet">
        <input className="input mono" value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="0x…" />
      </Field>
      {valid && <RoleCheck role={role} account={addr as Address} />}
      <div className="flex gap-2">
        <button className="btn" disabled={!valid || tx.pending} onClick={() => tx.send({ address: platform, abi: platformAbi, ...grant(addr) })}>
          Approve
        </button>
        <button className="btn btn-secondary" disabled={!valid || tx.pending} onClick={() => tx.send({ address: platform, abi: platformAbi, ...revoke(addr) })}>
          Revoke
        </button>
      </div>
      <TxStatus {...tx} successText="Role updated." />
    </div>
  );
}

function Presets({ isAdmin }: { isAdmin: boolean }) {
  const { platform } = usePlatform();
  const c = { address: platform, abi: platformAbi } as const;
  const { data, refetch } = useReadContracts({
    contracts: PRESETS.map((p) => ({ ...c, functionName: "getPreset", args: [p.id] }) as const),
  });
  const [id, setId] = useState(0);
  const [maxHolders, setMaxHolders] = useState("");
  const [active, setActive] = useState(true);
  const tx = useTx(() => refetch());
  const current = data?.[id]?.result as { name: string; maxHolders: number; claimTopics: readonly bigint[]; active: boolean } | undefined;

  return (
    <div className="card">
      <h3>asset-type presets</h3>
      <p>Enforced for every new token. Update them when Swiss law changes; existing tokens keep their settings.</p>
      <ul>
        {PRESETS.map((p, i) => {
          const r = data?.[i]?.result as { name: string; maxHolders: number; claimTopics: readonly bigint[]; active: boolean } | undefined;
          return (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b py-2" style={{ borderColor: "var(--line)" }}>
              <span>
                {r?.name ?? p.name}
                {r && !r.active && <span className="badge badge-alert ml-2">disabled</span>}
              </span>
              <span className="muted">
                {r ? `${r.maxHolders} holders · ${r.claimTopics.map((t) => CLAIM_TOPICS[Number(t)]?.short ?? `topic ${t}`).join(" + ")}` : "…"}
              </span>
            </li>
          );
        })}
      </ul>
      {isAdmin && current && (
        <>
          <h4 className="pt-2">edit a preset</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Preset">
              <select className="input" value={id} onChange={(e) => setId(Number(e.target.value))}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Max holders" hint={`Currently ${current.maxHolders}.`}>
              <input className="input" type="number" min={1} value={maxHolders} onChange={(e) => setMaxHolders(e.target.value)} />
            </Field>
            <Field label="Status">
              <select className="input" value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                <option value="1">active</option>
                <option value="0">disabled</option>
              </select>
            </Field>
          </div>
          <button
            className="btn btn-secondary"
            disabled={tx.pending}
            onClick={() =>
              tx.send({
                address: platform,
                abi: platformAbi,
                functionName: "setPreset",
                args: [id, current.name, maxHolders ? Number(maxHolders) : current.maxHolders, current.claimTopics, active],
              })
            }
          >
            Save preset
          </button>
          <TxStatus {...tx} successText="Preset updated." />
        </>
      )}
    </div>
  );
}

function AdminPanel() {
  const { platform, claimIssuer, identityStorage } = usePlatform();
  const { address } = useAccount();
  const { data: isAdmin } = useReadContract({
    address: platform,
    abi: platformAbi,
    functionName: "hasRole",
    args: address ? [ADMIN_ROLE, address] : undefined,
    query: { enabled: !!address },
  });
  const { data: restricted } = useReadContract({ address: platform, abi: platformAbi, functionName: "defaultRestrictedCountries" });
  const { data: tokens } = useReadContract({ address: platform, abi: platformAbi, functionName: "allTokens" });

  return (
    <div className="space-y-4">
      <div className="card">
        <dl className="grid gap-x-12 sm:grid-cols-2">
          {[
            ["Platform", <AddressLink key="p" address={platform} />],
            ["Claim issuer", <AddressLink key="c" address={claimIssuer} />],
            ["Identity storage", <AddressLink key="s" address={identityStorage} />],
            ["Tokens", tokens?.length.toString() ?? "…"],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between gap-4 border-b py-2" style={{ borderColor: "var(--line)" }}>
              <dt className="muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <p>
          <span className="label-caps mr-2">restricted on every token</span>
          {restricted?.map((c) => countryName(c)).join(", ") ?? "…"}
        </p>
      </div>

      {!isAdmin ? (
        <Notice>Connect the platform admin wallet to manage roles and presets.</Notice>
      ) : (
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-2">
          <RoleManager
            title="issuers"
            text="Approved issuers can create tokens and act as agents of their own tokens."
            role={ISSUER_ROLE}
            grant={(a) => ({ functionName: "grantRole", args: [ISSUER_ROLE, a] })}
            revoke={(a) => ({ functionName: "revokeRole", args: [ISSUER_ROLE, a] })}
          />
          <RoleManager
            title="compliance officers"
            text="Officers onboard investors and sign their claims (KYC, Lex Koller, qualified investor)."
            role={OFFICER_ROLE}
            grant={(a) => ({ functionName: "addComplianceOfficer", args: [a] })}
            revoke={(a) => ({ functionName: "removeComplianceOfficer", args: [a] })}
          />
        </div>
      )}
      <Presets isAdmin={!!isAdmin} />
    </div>
  );
}

export default function AdminPage() {
  return (
    <div>
      <h2 className="mb-9">platform admin</h2>
      <PlatformGuard>
        <AdminPanel />
      </PlatformGuard>
    </div>
  );
}
