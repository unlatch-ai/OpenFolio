import Link from "next/link";
import { notFound } from "next/navigation";
import { docs, type DocSlug } from "../content";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = docs[slug as DocSlug];

  if (!doc) {
    notFound();
  }

  return (
    <div className="page-shell">
      <div className="page-frame">
        <nav className="nav">
          <Link href="/">OpenFolio</Link>
          <div className="nav-links">
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/unlatch-ai/OpenFolio/releases">Download</a>
          </div>
        </nav>

        <div className="doc-layout">
          <aside className="doc-sidebar">
            <p className="eyebrow">Docs</p>
            <ul>
              {Object.entries(docs).map(([entrySlug, entry]) => (
                <li key={entrySlug}>
                  <Link className={entrySlug === slug ? "active" : ""} href={`/docs/${entrySlug}`}>
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <article className="doc-content">
            <p className="eyebrow">Documentation</p>
            <h1>{doc.title}</h1>
            {doc.body
              .trim()
              .split("\n\n")
              .map((section) => {
                if (section.startsWith("### ")) {
                  return <h3 key={section}>{section.replace("### ", "")}</h3>;
                }
                if (section.startsWith("- ")) {
                  return (
                    <ul key={section}>
                      {section.split("\n").map((line) => (
                        <li key={line}>{line.replace(/^- /, "")}</li>
                      ))}
                    </ul>
                  );
                }
                if (/^\d+\./.test(section)) {
                  return (
                    <ol key={section}>
                      {section.split("\n").map((line) => (
                        <li key={line}>{line.replace(/^\d+\.\s*/, "")}</li>
                      ))}
                    </ol>
                  );
                }
                if (section.includes("`")) {
                  return <pre key={section}><code>{section}</code></pre>;
                }
                return <p key={section}>{section}</p>;
              })}
          </article>
        </div>
      </div>
    </div>
  );
}
