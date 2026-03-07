import Link from "next/link";
import { docs } from "./content";

export default function DocsIndexPage() {
  return (
    <div className="page-shell">
      <div className="page-frame">
        <nav className="nav">
          <Link href="/">OpenFolio</Link>
          <Link href="https://github.com/unlatch-ai/OpenFolio/releases">Download</Link>
        </nav>
        <section className="section">
          <p className="eyebrow">Documentation</p>
          <div className="docs-grid">
            {Object.entries(docs).map(([slug, doc]) => (
              <Link className="doc-card" href={`/docs/${slug}`} key={slug}>
                <h3>{doc.title}</h3>
                <p>{doc.body.split("\n").filter(Boolean)[0]}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
