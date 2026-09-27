import { CLAIM_TOPICS, LAW_URLS, LAWS, PRESETS } from "@/lib/swiss";

export const metadata = { title: "References — ERC-3643 Platform" };

export default function References() {
  return (
    <div className="space-y-16">
      <section>
        <h2 className="mb-9">references</h2>
        <p className="lead">
          The rules each token enforces, and the Swiss law they come from.{" "}
          <span className="q">
            Rules are enforced on-chain by ERC-3643 identity checks and compliance modules. Issuers can tighten them
            per token but never loosen them beyond the asset-type preset.
          </span>
        </p>
      </section>

      <section>
        <h2 className="mb-5">asset-type presets</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="muted text-[10px] uppercase tracking-[0.14em]">
                <th className="py-2 pr-4 font-normal">Asset type</th>
                <th className="py-2 pr-4 font-normal">Holders</th>
                <th className="py-2 pr-4 font-normal">Required claims</th>
                <th className="py-2 font-normal">Legal basis</th>
              </tr>
            </thead>
            <tbody>
              {PRESETS.map((p) => (
                <tr key={p.id} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                  <td className="py-3 pr-4">
                    {p.name}
                    <p className="muted mt-1 max-w-[260px] text-[11px]">{p.summary}</p>
                  </td>
                  <td className="py-3 pr-4" style={{ color: "var(--mid)" }}>
                    {p.holderRule}
                  </td>
                  <td className="py-3 pr-4" style={{ color: "var(--mid)" }}>
                    {p.claims.map((t) => CLAIM_TOPICS[t].short).join(" + ")}
                  </td>
                  <td className="py-3" style={{ color: "var(--mid)" }}>
                    {p.refs.map((r, i) => (
                      <span key={i} className="block">
                        <a href={r.href} target="_blank" rel="noreferrer">
                          {r.law} {r.article}
                        </a>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted mt-4 text-[11px]">
          On every token: KYC/AML claim required · Russia, Belarus, North Korea, Iran and Myanmar restricted by default
          · optional lock-up, max balance per investor, supply cap and extra country restrictions.
        </p>
      </section>

      <section>
        <h2 className="mb-5">investor claims</h2>
        <ul className="border-b" style={{ borderColor: "var(--line)" }}>
          {Object.entries(CLAIM_TOPICS).map(([id, c]) => (
            <li key={id} className="grid gap-x-6 border-t py-3 sm:grid-cols-[60px_1fr_auto]" style={{ borderColor: "var(--line)" }}>
              <span className="muted">topic {id}</span>
              <span>{c.name}</span>
              <a href={c.ref.href} target="_blank" rel="noreferrer" className="muted">
                {c.ref.law} {c.ref.article}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-5">laws &amp; regulations</h2>
        <div className="space-y-10">
          {LAWS.map((l) => (
            <div key={l.key}>
              <p>
                <a href={LAW_URLS[l.key]} target="_blank" rel="noreferrer">
                  {l.title}
                </a>
                <span className="muted ml-2 text-[11px]">{l.sr}</span>
              </p>
              <ul className="mt-3 space-y-3">
                {l.provisions.map((p, i) => (
                  <li key={i} className="grid gap-x-6 sm:grid-cols-[160px_1fr]">
                    <span className="muted">{p.article}</span>
                    <span>
                      <span style={{ color: "var(--mid)" }}>{p.rule}</span>
                      <span className="mt-1 block text-[11px]">
                        <span className="label-caps mr-2">enforced by</span>
                        {p.enforcement}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <h2 className="mb-3">disclaimer</h2>
        <p className="muted max-w-[640px] text-[11px]">
          This platform enforces the rules above technically; it is not legal advice. Thresholds and presets reflect the
          author&apos;s reading of Swiss law as of September 2026 (the 19-holder cap on real estate is a platform
          policy, not a statutory limit). A revision of Lex Koller is under discussion. Every issuance should be reviewed
          by a qualified Swiss lawyer, and presets can be updated by the platform administrator when the law changes.
        </p>
      </section>
    </div>
  );
}
