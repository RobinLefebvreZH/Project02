"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const links = [
  { href: "/", label: "tokens" },
  { href: "/issuer", label: "issuer" },
  { href: "/investors", label: "investors" },
  { href: "/admin", label: "admin" },
  { href: "/references", label: "references" },
];

const navLink = "ml-[22px] text-[11px]";

function Wallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) return <span className={navLink} aria-hidden />;
        if (!account || !chain) {
          return (
            <button onClick={openConnectModal} className={`${navLink} cursor-pointer`} style={{ color: "var(--ink)" }}>
              connect wallet
            </button>
          );
        }
        return (
          <>
            <button
              onClick={openChainModal}
              className={`${navLink} cursor-pointer`}
              style={{ color: chain.unsupported ? "var(--alert)" : "var(--quiet)" }}
            >
              {chain.unsupported ? "wrong network" : chain.name?.toLowerCase()}
            </button>
            <button onClick={openAccountModal} className={`${navLink} cursor-pointer`} style={{ color: "var(--ink)" }}>
              {account.displayName}
            </button>
          </>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/token") : path.startsWith(href));
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-y-3 px-[18px] py-5 sm:px-8 sm:py-7">
      <Link href="/" className="text-[11px] uppercase tracking-[0.18em]">
        ERC-3643 Platform
      </Link>
      <nav className="-ml-[22px] flex flex-wrap items-baseline">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={navLink}
            style={{ color: active(l.href) ? "var(--ink)" : "var(--quiet)" }}
          >
            {l.label}
          </Link>
        ))}
        <span className={navLink} style={{ color: "var(--line)" }}>
          |
        </span>
        <Wallet />
      </nav>
    </header>
  );
}
