"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, type Abi } from "viem";
import { PLATFORM_ADDRESSES } from "./config";

export function usePlatformAddress() {
  const chainId = useChainId();
  return { chainId, platform: PLATFORM_ADDRESSES[chainId] };
}

/** Human readable message from a viem/wagmi error, including custom Solidity errors. */
export function errorMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      const a = revert.data?.args?.map(String) ?? [];
      const friendly: Record<string, string> = {
        MaxHoldersAbovePreset: `The holder limit can't exceed ${a[1]} for this asset type.`,
        CountryIsDefaultRestricted: "This country is restricted by default (sanctions / FATF) and can't be unrestricted.",
        NotTokenIssuer: "Only the token's issuer can do this.",
        NotTokenManager: "Only the token's issuer or agents can do this.",
        InvalidPreset: "This asset-type preset is not available.",
        IdentityMismatch: "The identity address changed while signing. Please sign again.",
        InvalidDocument: "Document name and URI are required.",
        LengthMismatch: "Each claim needs a signature.",
        NotConfigured: "The platform is not configured yet.",
        AccessControlUnauthorizedAccount: "Your wallet doesn't have the required role.",
      };
      // T-REX uses revert strings
      const reason = revert.reason;
      const reasons: Record<string, string> = {
        "Identity is not verified.": "The receiving wallet is not a verified investor for this token (missing KYC or a required claim).",
        "Compliance not followed": "Blocked by the token's compliance rules (holder limit, country, max balance, supply limit or lock-up).",
        "Transfer not possible": "Blocked: the receiver isn't eligible, or the transfer breaks a compliance rule (holder limit, country, lock-up, max balance).",
        "wallet is frozen": "One of the wallets is frozen.",
        "Insufficient Balance": "Not enough unfrozen tokens.",
        "Pausable: paused": "The token is paused.",
        "Pausable: not paused": "The token is not paused.",
        "AgentRole: caller does not have the Agent role": "Your wallet is not an agent of this token.",
        "invalid claim": "A claim signature is invalid. Is your wallet registered as a compliance officer?",
        "no tokens to recover": "The lost wallet holds no tokens.",
        "Recovery not possible": "The new wallet isn't linked to the investor's identity yet (use 'Add recovery wallet' on the Investors page).",
      };
      if (reason && reasons[reason]) return reasons[reason];
      if (reason?.startsWith("AccessControl:")) return "Your wallet doesn't have the required role.";
      if (reason) return reason;
      if (name && friendly[name]) return friendly[name];
      if (name) return a.length ? `${name}(${a.join(", ")})` : name;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

type WriteArgs = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};

/** Sends a transaction, waits for the receipt and exposes a simple status. */
export function useTx(onSuccess?: () => void) {
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const { address: account } = useAccount();
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<`0x${string}`>();

  const send = useCallback(
    async (req: WriteArgs) => {
      setStatus("pending");
      setError(undefined);
      try {
        // Simulate first so a revert shows its decoded reason (e.g. "NotAllowed(0x…)") before the wallet opens.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client!.simulateContract({ ...(req as any), account });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = await writeContractAsync(req as any);
        setHash(h);
        const receipt = await client!.waitForTransactionReceipt({ hash: h });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setStatus("success");
        onSuccess?.();
        return receipt;
      } catch (e) {
        setStatus("error");
        setError(errorMessage(e));
      }
    },
    [writeContractAsync, client, account, onSuccess],
  );

  return { send, status, error, hash, pending: status === "pending" };
}
