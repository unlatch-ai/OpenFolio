import Link from "next/link";

const features = [
  {
    title: "Messages-first graph",
    description: "Read-only iMessage import turns your Mac into a relationship memory layer instead of another CRM form.",
  },
  {
    title: "Local search + AI",
    description: "Keyword, semantic, and ask-style search run against your local graph before any hosted service is involved.",
  },
  {
    title: "Agent access",
    description: "MCP and CLI surfaces let your own agents interact with your data using explicit local scopes.",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell">
      <div className="page-frame">
        <nav className="nav">
          <strong>OpenFolio</strong>
          <div className="nav-links">
            <Link href="/docs">Docs</Link>
            <Link href="/account">Account</Link>
            <a href="https://github.com/unlatch-ai/OpenFolio">GitHub</a>
          </div>
        </nav>

        <section className="hero">
          <p className="eyebrow">macOS app + optional hosted services</p>
          <h1>Local-first relationship intelligence, not CRM busywork.</h1>
          <p>
            OpenFolio is a Messages-first dashboard for your personal network. The Mac app keeps the
            graph local, while hosted services handle identity, billing, hosted AI, managed connectors,
            and future hosted MCP access when you opt in.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="https://github.com/unlatch-ai/OpenFolio/releases">
              Download for macOS
            </a>
            <Link className="button secondary" href="/account">
              Manage account
            </Link>
            <Link className="button secondary" href="/docs">
              Read the docs
            </Link>
          </div>
        </section>

        <section className="section">
          <p className="eyebrow">What ships in v1</p>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <p className="eyebrow">Documentation</p>
          <div className="docs-grid">
            <Link className="doc-card" href="/docs/getting-started">
              <h3>Getting Started</h3>
              <p>Install the Mac app, grant Full Disk Access, and import Messages. Account sign-in is optional.</p>
            </Link>
            <Link className="doc-card" href="/docs/architecture">
              <h3>Architecture</h3>
              <p>Learn how the local SQLite graph, Electron shell, MCP package, and Convex hosted services fit together.</p>
            </Link>
            <Link className="doc-card" href="/docs/privacy">
              <h3>Privacy</h3>
              <p>Understand what stays on-device, what can go to hosted services, and how OpenFolio treats Messages data.</p>
            </Link>
            <Link className="doc-card" href="/docs/deployment">
              <h3>Deployment</h3>
              <p>Set up GitHub Releases for the DMG, deploy the docs site on Vercel, and configure the hosted Convex services.</p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
