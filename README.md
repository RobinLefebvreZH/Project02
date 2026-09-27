# ERC-3643 Platform — Swiss real-world assets

An issuance platform for **ERC-3643 (T-REX) security tokens** backed by Swiss real-world assets, built on the **official
T-REX v4.1.6** and **ONCHAINID v2.2.1** contracts. Each asset type comes with a **preset of investor rules derived from
Swiss law** (Lex Koller, Banking Ordinance, FinSA, CISA, AMLA, sanctions), enforced on-chain. The web app lists
every rule and its legal basis on a References tab.

Live (Sepolia testnet): <https://robin-lefebvre.com/erc-3643>

## What's inside

| Layer | Contracts | Origin |
|---|---|---|
| Token & registries | `Token`, `IdentityRegistry`, `IdentityRegistryStorage` (shared), `ClaimTopicsRegistry`, `TrustedIssuersRegistry`, `ModularCompliance`, `TREXFactory`, `TREXImplementationAuthority` | Official T-REX (ERC-3643) |
| Identity | `Identity` (ONCHAINID), `IdFactory`, `ClaimIssuer`, `ImplementationAuthority` | Official ONCHAINID |
| Compliance modules | `MaxBalanceModule`, `CountryRestrictModule`, `SupplyLimitModule` | Official T-REX |
| Compliance modules | `MaxHoldersModule` (holders counted per identity), `LockUpModule` | This repo |
| Platform | `SwissRWAPlatform` (UUPS upgradeable), `AssetRegistry` | This repo |

### How it works

```
Platform admin ──► SwissRWAPlatform ──owns──► TREXFactory, IdFactory, every token suite
                        │                     (so presets can't be bypassed)
   Compliance officer ──┤ onboardInvestor: ONCHAINID + signed claims + country
                        │                  → shared IdentityRegistryStorage (once, for all tokens)
   Approved issuer ─────┤ createToken(preset) → T-REX suite with modules configured by the preset
                        │ setMaxHolders / setLockUp / setMaxBalance / setSupplyLimit / setCountriesRestricted
                        │ (bounded by the preset)
   Issuer as token agent ─► Token: mint · burn · pause · freeze · partial freeze · forced transfer · recovery
```

- **Investor claims** (issued by the platform's ClaimIssuer, signed by a compliance officer):
  topic 1 KYC/AML (AMLA), topic 2 Lex Koller eligible (BewG Art. 5), topic 3 qualified investor (CISA Art. 10).
  Revoking a claim blocks the investor on every token immediately.
- **Presets**

  | Preset | Max holders | Required claims | Basis |
  |---|---|---|---|
  | Residential real estate | 19 (platform policy) | KYC + Lex Koller | BewG Art. 4–5 |
  | Commercial real estate | 19 (platform policy) | KYC | BewG Art. 2 para. 2 let. a |
  | Private credit / debt | 20 | KYC | BankO Art. 5–6 |
  | Collective investment | 499 | KYC + qualified investor | CISA Art. 2 para. 3, 10 |
  | Equity / commodities / art | 499 | KYC | FinSA Art. 36 |

- **Every token**: Russia, Belarus (Swiss sanctions ordinances) and DPRK, Iran, Myanmar (FATF call for action) are
  restricted by default and cannot be unrestricted by issuers. Optional lock-up, max balance per investor, supply cap
  and extra country restrictions.
- **AssetRegistry**: asset type, jurisdiction, legal entity, valuation, and legal documents (URI + keccak256 hash).

```
Project02/
├── contracts/     Foundry — src/ (platform, registry, modules), script/ (deployment), test/ (26 tests)
│   └── lib/       T-REX, ONCHAINID, OpenZeppelin 4.8.3, forge-std (git submodules)
└── web/           Next.js app — tokens · issuer · investors (KYC desk) · admin · references
```

## Run locally

```bash
git clone --recurse-submodules https://github.com/RobinLefebvreZH/Project02.git
cd Project02/contracts
forge test                                   # 26 tests against the real T-REX contracts

anvil --gas-limit 100000000                  # second terminal
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil's public test key

cd ../web
cp .env.example .env.local   # NEXT_PUBLIC_ENABLE_LOCAL=true, NEXT_PUBLIC_PLATFORM_ADDRESS_LOCAL=<printed address>
npm install && npm run dev
```

## Deploy to Sepolia

```bash
cd contracts && source .env
forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --sender $PLATFORM_ADMIN --broadcast --verify
```

The full deployment uses about 38M gas (~0.04 Sepolia ETH). The deploying wallet becomes platform admin and compliance
officer; `INITIAL_ISSUERS` are approved as issuers. Put the printed `SwissRWAPlatform` address in
`web/.env.local` as `NEXT_PUBLIC_PLATFORM_ADDRESS_SEPOLIA`.

**Static hosting** (e.g. OVH at `/erc-3643`): `cd web && npm run build:ovh`, then upload the contents of `web/out/`.

## First steps after deploying

1. **Investors** page: onboard investor wallets (country + claims; you sign each claim in your wallet).
2. **Issuer** page: pick an asset type and create a token. Tokens start **paused**.
3. Token page: **Unpause**, then **Mint** to onboarded investors.

## Disclaimer

Not audited. The presets encode the author's reading of Swiss law as of September 2026 and are not legal advice; the
19-holder cap on real estate is a platform policy, not a statutory limit. Have every issuance reviewed by a Swiss lawyer.

## License

GPL-3.0, as required by the T-REX and ONCHAINID code this project builds on.
