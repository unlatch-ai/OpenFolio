import Link from "next/link";
import { ArrowRight, Download, Github, ShieldCheck } from "lucide-react";
import { DemoConversation } from "@/components/demo-conversation";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

const surfaces = [
  {
    index: "01",
    title: "Search",
    body: "Search with the words you remember. OpenFolio ranks exact and meaning-based matches from your local archive.",
  },
  {
    index: "02",
    title: "People",
    body: "Browse the people in your history, then search every conversation connected to one person.",
  },
  {
    index: "03",
    title: "Conversations",
    body: "Open the source message with its surrounding context. Search always leads back to evidence.",
  },
  {
    index: "04",
    title: "Year in review",
    body: "Revisit a year through deterministic totals, rhythms, and people—not generated interpretations.",
  },
];

const privacyFacts = [
  ["Messages", "Read-only from the database already on your Mac"],
  ["Search index", "Stored locally in OpenFolio’s Application Support folder"],
  ["Semantic search", "Bundled q8 all-MiniLM-L6-v2 model, about 23 MB"],
  ["Fallback", "Exact search stays available if semantic search is not ready"],
  ["Account", "Not required"],
  ["Updates", "Manual download and app replacement; local data stays in place"],
];

export default function HomePage() {
  return (
    <div className="site-shell">
      <Navbar />
      <main>

      <section className="hero section-frame" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span>Open source</span><span>Private iMessage search</span></p>
          <h1 id="hero-title">Search every iMessage on your Mac.</h1>
          <p className="hero-deck">
            Find the person, fact, or message you remember, even when you do
            not remember the exact words. Every result links back to the
            original conversation.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="https://github.com/unlatch-ai/OpenFolio/releases/latest">
              <Download aria-hidden="true" /> Download for macOS
            </a>
            <a className="button button-quiet" href="https://github.com/unlatch-ai/OpenFolio">
              <Github aria-hidden="true" /> View source
            </a>
          </div>
          <p className="microcopy">Open source · macOS · no account · manual updates</p>
        </div>

        <div className="hero-artifact" aria-label="A sample OpenFolio search for a restaurant recommendation">
          <DemoConversation />
        </div>
      </section>

      <section className="statement-band" aria-label="Product principle">
        <div className="section-frame statement-grid">
          <p className="folio-mark">What it does</p>
          <p className="statement-copy">
            OpenFolio turns years of messages into a private, searchable archive.
            It finds evidence. It does not invent answers or score relationships.
          </p>
        </div>
      </section>

      <section className="section-frame editorial-section" aria-labelledby="workflow-title">
        <div className="section-heading">
          <p className="eyebrow"><span>How it works</span><span>Recall to source</span></p>
          <h2 id="workflow-title">Remember. Find. Verify.</h2>
        </div>
        <ol className="process-grid">
          <li><span>01</span><h3>Remember</h3><p>Describe a phrase, place, plan, or person—even if you do not remember the exact words.</p></li>
          <li><span>02</span><h3>Find</h3><p>Review ranked message, person, and conversation matches from your local archive.</p></li>
          <li><span>03</span><h3>Verify</h3><p>Open the cited message in context. The source stays visible; OpenFolio does not invent an answer.</p></li>
        </ol>
      </section>

      <section className="section-frame editorial-section surfaces-section" aria-labelledby="surfaces-title">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span>Your archive</span><span>Four views</span></p>
            <h2 id="surfaces-title">Search comes first.</h2>
          </div>
          <p>People organize memory. Conversations preserve evidence. Year in review creates reflection.</p>
        </div>
        <div className="surface-index">
          {surfaces.map((surface) => (
            <article className="surface-row" key={surface.index}>
              <span>{surface.index}</span>
              <h3>{surface.title}</h3>
              <p>{surface.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="privacy-section" aria-labelledby="privacy-title">
        <div className="section-frame privacy-grid">
          <div className="privacy-intro">
            <ShieldCheck aria-hidden="true" />
            <p className="eyebrow"><span>Privacy</span><span>Local by design</span></p>
            <h2 id="privacy-title">Your archive stays on your Mac.</h2>
            <p>
              The production app is built to deny network access. It reads
              Messages in place, builds a separate local index, and runs both
              exact and semantic retrieval on-device.
            </p>
            <Link href="/docs/privacy" className="text-link">Read the precise privacy boundary <ArrowRight aria-hidden="true" /></Link>
          </div>
          <dl className="fact-list">
            {privacyFacts.map(([term, description]) => (
              <div key={term}><dt>{term}</dt><dd>{description}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section-frame release-note" aria-labelledby="release-title">
        <p className="folio-mark">Updates</p>
        <div>
          <h2 id="release-title">No background updater.</h2>
          <p>
            To update, download the newest release and replace OpenFolio in
            Applications. Your index and settings remain in macOS Application
            Support, separate from the app bundle.
          </p>
          <p className="verification-note">
            The code and packaged app enforce a zero-network policy. The final
            signed-release claim remains gated on PID-attributed traffic testing
            of the signed artifact on macOS.
          </p>
        </div>
      </section>

      <section className="closing-section">
        <div className="section-frame closing-grid">
          <p className="eyebrow"><span>Open source</span><span>AGPL-3.0</span></p>
          <h2>Find the message.<br />Keep the context.</h2>
          <div className="closing-actions">
            <a className="button button-light" href="https://github.com/unlatch-ai/OpenFolio/releases/latest">
              Download for macOS <ArrowRight aria-hidden="true" />
            </a>
            <Link href="/docs/getting-started" className="text-link text-link-dark">Installation guide</Link>
          </div>
        </div>
      </section>
      </main>

      <Footer />
    </div>
  );
}
