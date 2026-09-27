"use client";

import type { ReactNode } from "react";
import { useChainId } from "wagmi";
import { explorerUrl } from "@/lib/config";

export function TxStatus({
  status,
  error,
  hash,
  successText = "Done.",
}: {
  status: string;
  error?: string;
  hash?: string;
  successText?: string;
}) {
  const chainId = useChainId();
  const link = hash ? explorerUrl(chainId, "tx", hash) : undefined;
  if (status === "idle") return null;
  return (
    <p className="mt-2" role="status">
      {status === "pending" && <span className="muted">Waiting for confirmation…</span>}
      {status === "success" && <span style={{ color: "var(--ink)" }}>{successText}</span>}
      {status === "error" && <span style={{ color: "var(--alert)" }}>{error}</span>}
      {link && (
        <>
          {" "}
          <a href={link} target="_blank" rel="noreferrer" >
            View transaction
          </a>
        </>
      )}
    </p>
  );
}

export function AddressLink({ address }: { address: string }) {
  const chainId = useChainId();
  const link = explorerUrl(chainId, "address", address);
  return link ? (
    <a href={link} target="_blank" rel="noreferrer" className="mono">
      {address}
    </a>
  ) : (
    <span className="mono">{address}</span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="card muted">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-[11px]">{hint}</span>}
    </label>
  );
}
