// Swiss legal framework enforced by the platform: claim topics, asset-type presets and references.
// Preset ids and claim topics must match script/SuiteDeployer.sol.

export type LawRef = { law: string; article: string; href: string };

const FEDLEX = "https://www.fedlex.admin.ch/eli/cc";

export const LAW_URLS = {
  CO: `${FEDLEX}/27/317_321_377/en`,
  FinSA: `${FEDLEX}/2019/758/en`,
  CISA: `${FEDLEX}/2006/822/en`,
  BankA: `${FEDLEX}/51/117_121_129/en`,
  BankO: `${FEDLEX}/2014/273/en`,
  BewG: `${FEDLEX}/1984/1148_1148_1148/en`,
  AMLA: `${FEDLEX}/1998/892_892_892/en`,
  FinMIA: `${FEDLEX}/2015/853/en`,
  Ukraine: `${FEDLEX}/2022/151/en`,
  FATF: "https://www.fatf-gafi.org/en/topics/high-risk-and-other-monitored-jurisdictions.html",
};

export const CLAIM_TOPICS: Record<number, { name: string; short: string; ref: LawRef }> = {
  1: {
    name: "KYC / AML verified",
    short: "KYC",
    ref: { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
  },
  2: {
    name: "Lex Koller eligible (not a person abroad)",
    short: "Lex Koller",
    ref: { law: "BewG", article: "Art. 5", href: LAW_URLS.BewG },
  },
  3: {
    name: "Qualified investor",
    short: "Qualified",
    ref: { law: "CISA", article: "Art. 10 para. 3", href: LAW_URLS.CISA },
  },
};

export type PresetMeta = {
  id: number;
  name: string;
  assetType: string;
  summary: string;
  holderRule: string;
  maxHolders: number;
  claims: number[];
  refs: LawRef[];
};

export const PRESETS: PresetMeta[] = [
  {
    id: 0,
    maxHolders: 19,
    claims: [1, 2],
    name: "Residential real estate",
    assetType: "Real estate",
    summary:
      "Only investors who are not 'persons abroad' under Lex Koller may hold shares in a company owning Swiss residential property. Holders are capped at 19 by platform policy.",
    holderRule: "Max 19 holders (platform policy)",
    refs: [
      { law: "BewG", article: "Art. 4 para. 1 let. e, Art. 5", href: LAW_URLS.BewG },
      { law: "CO", article: "Art. 973d ff.", href: LAW_URLS.CO },
      { law: "FinSA", article: "Art. 36", href: LAW_URLS.FinSA },
      { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
    ],
  },
  {
    id: 1,
    maxHolders: 19,
    claims: [1],
    name: "Commercial real estate",
    assetType: "Real estate",
    summary:
      "Property used as a permanent business establishment is exempt from Lex Koller authorisation, so foreign investors are allowed. Holders are capped at 19 by platform policy.",
    holderRule: "Max 19 holders (platform policy)",
    refs: [
      { law: "BewG", article: "Art. 2 para. 2 let. a", href: LAW_URLS.BewG },
      { law: "CO", article: "Art. 973d ff.", href: LAW_URLS.CO },
      { law: "FinSA", article: "Art. 36", href: LAW_URLS.FinSA },
      { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
    ],
  },
  {
    id: 2,
    maxHolders: 20,
    claims: [1],
    name: "Private credit / debt",
    assetType: "Private credit",
    summary:
      "Borrowing from more than 20 lenders on a lasting basis is deemed professional deposit-taking, which requires a banking licence unless an exception applies. Holders are capped at 20.",
    holderRule: "Max 20 holders",
    refs: [
      { law: "BankA", article: "Art. 1 para. 2", href: LAW_URLS.BankA },
      { law: "BankO", article: "Art. 5–6", href: LAW_URLS.BankO },
      { law: "FinSA", article: "Art. 36", href: LAW_URLS.FinSA },
      { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
    ],
  },
  {
    id: 3,
    maxHolders: 499,
    claims: [1, 3],
    name: "Collective investment (qualified investors)",
    assetType: "Collective investment",
    summary:
      "Pooled assets managed for investors can constitute a collective investment scheme. Investment companies restricted to qualified shareholders fall outside CISA; the token therefore requires a qualified-investor claim.",
    holderRule: "Max 499 holders",
    refs: [
      { law: "CISA", article: "Art. 2 para. 3, Art. 7", href: LAW_URLS.CISA },
      { law: "CISA", article: "Art. 10 para. 3", href: LAW_URLS.CISA },
      { law: "FinSA", article: "Art. 36", href: LAW_URLS.FinSA },
    ],
  },
  {
    id: 4,
    maxHolders: 499,
    claims: [1],
    name: "Equity",
    assetType: "Equity",
    summary: "Shares of an operating company issued as ledger-based securities. Offers to fewer than 500 investors are exempt from the prospectus duty.",
    holderRule: "Max 499 holders",
    refs: [
      { law: "CO", article: "Art. 973d ff.", href: LAW_URLS.CO },
      { law: "FinSA", article: "Art. 36 para. 1 let. b", href: LAW_URLS.FinSA },
    ],
  },
  {
    id: 5,
    maxHolders: 499,
    claims: [1],
    name: "Commodities",
    assetType: "Commodity",
    summary: "Tokens representing allocated commodities (e.g. precious metals in custody).",
    holderRule: "Max 499 holders",
    refs: [
      { law: "FinSA", article: "Art. 36 para. 1 let. b", href: LAW_URLS.FinSA },
      { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
    ],
  },
  {
    id: 6,
    maxHolders: 499,
    claims: [1],
    name: "Art & collectibles",
    assetType: "Art & collectibles",
    summary: "Fractional ownership of artworks or collectibles held by an issuing entity.",
    holderRule: "Max 499 holders",
    refs: [
      { law: "FinSA", article: "Art. 36 para. 1 let. b", href: LAW_URLS.FinSA },
      { law: "AMLA", article: "Art. 3–4", href: LAW_URLS.AMLA },
    ],
  },
];

export type Law = {
  key: keyof typeof LAW_URLS;
  title: string;
  sr: string;
  provisions: { article: string; rule: string; enforcement: string }[];
};

export const LAWS: Law[] = [
  {
    key: "CO",
    title: "Code of Obligations — ledger-based securities (DLT Act)",
    sr: "SR 220",
    provisions: [
      {
        article: "Art. 973d–973i",
        rule: "Rights can be registered on a distributed ledger as ledger-based securities; transferring the token transfers the right.",
        enforcement: "Each token is an ERC-3643 security token; transfers only settle between verified identities.",
      },
    ],
  },
  {
    key: "FinSA",
    title: "Financial Services Act",
    sr: "SR 950.1",
    provisions: [
      {
        article: "Art. 36 para. 1",
        rule: "No prospectus is required for offers to professional clients only, to fewer than 500 investors, with at least CHF 100,000 per investor or denomination, or under CHF 8 million over 12 months.",
        enforcement: "Holder caps of 499 or lower on every preset (MaxHoldersModule, counted per identity).",
      },
    ],
  },
  {
    key: "CISA",
    title: "Collective Investment Schemes Act",
    sr: "SR 951.31",
    provisions: [
      {
        article: "Art. 7",
        rule: "Assets raised from investors for collective investment and managed for their account form a collective investment scheme.",
        enforcement: "Fund-like assets use the 'Collective investment' preset.",
      },
      {
        article: "Art. 2 para. 3",
        rule: "Investment companies whose shareholders are exclusively qualified investors (registered shares) are outside the Act's scope.",
        enforcement: "Qualified-investor claim (topic 3) required for every holder.",
      },
      {
        article: "Art. 10 para. 3, 3ter",
        rule: "Defines qualified investors (professional clients, and retail clients under a long-term asset management or advisory relationship).",
        enforcement: "Compliance officer issues the claim after checking the investor's status.",
      },
    ],
  },
  {
    key: "BankA",
    title: "Banking Act",
    sr: "SR 952.0",
    provisions: [
      {
        article: "Art. 1 para. 2",
        rule: "Non-banks may not accept deposits from the public on a professional basis.",
        enforcement: "Debt tokens are capped at 20 holders (see Banking Ordinance).",
      },
    ],
  },
  {
    key: "BankO",
    title: "Banking Ordinance",
    sr: "SR 952.02",
    provisions: [
      {
        article: "Art. 5–6",
        rule: "Accepting more than 20 public deposits on a lasting basis is professional deposit-taking; lists the exceptions (e.g. bonds with prospectus information, the CHF 1 million sandbox).",
        enforcement: "'Private credit / debt' preset: max 20 holders, counted per investor identity.",
      },
    ],
  },
  {
    key: "BewG",
    title: "Lex Koller — Acquisition of Real Estate by Persons Abroad",
    sr: "SR 211.412.41",
    provisions: [
      {
        article: "Art. 4 para. 1 let. e",
        rule: "Acquiring shares in a company whose purpose is holding Swiss real estate counts as acquiring the real estate (unless listed on a Swiss exchange).",
        enforcement: "Residential real estate tokens require the Lex Koller claim (topic 2).",
      },
      {
        article: "Art. 5",
        rule: "Defines 'persons abroad' (e.g. foreign nationals not resident in Switzerland, non-EU/EFTA nationals without a C permit).",
        enforcement: "Compliance officer issues the claim only to persons who are not persons abroad.",
      },
      {
        article: "Art. 2 para. 2 let. a",
        rule: "Property used as a permanent business establishment does not require authorisation.",
        enforcement: "Commercial real estate preset does not require the Lex Koller claim.",
      },
    ],
  },
  {
    key: "AMLA",
    title: "Anti-Money Laundering Act",
    sr: "SR 955.0",
    provisions: [
      {
        article: "Art. 3–4",
        rule: "Financial intermediaries must verify the identity of the contracting party and establish the beneficial owner.",
        enforcement: "Every preset requires the KYC/AML claim (topic 1); revoking it blocks the investor on all tokens immediately.",
      },
    ],
  },
  {
    key: "Ukraine",
    title: "Sanctions — Ordinance on measures in connection with the situation in Ukraine (and Belarus, SR 946.231.116.9)",
    sr: "SR 946.231.176.72",
    provisions: [
      {
        article: "Securities and financial services restrictions",
        rule: "Restricts the sale of securities and the provision of certain financial services to Russian and Belarusian nationals and residents.",
        enforcement: "Russia (643) and Belarus (112) are restricted by default on every token and cannot be unrestricted by issuers.",
      },
    ],
  },
  {
    key: "FATF",
    title: "FATF — High-risk jurisdictions subject to a call for action (June 2026)",
    sr: "FATF",
    provisions: [
      {
        article: "Call for action",
        rule: "DPRK, Iran and Myanmar are subject to enhanced due diligence and countermeasures.",
        enforcement: "North Korea (408), Iran (364) and Myanmar (104) are restricted by default.",
      },
    ],
  },
  {
    key: "FinMIA",
    title: "Financial Market Infrastructure Act — DLT trading facilities",
    sr: "SR 958.1",
    provisions: [
      {
        article: "Art. 73a ff.",
        rule: "Multilateral secondary trading of ledger-based securities requires a DLT trading facility licence.",
        enforcement: "Not enforced on-chain: the platform handles issuance and bilateral transfers only.",
      },
    ],
  },
];
