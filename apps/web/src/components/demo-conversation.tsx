import { ArrowUpRight, Search } from "lucide-react";

const results = [
  {
    person: "Maya Chen",
    source: "Maya · Dinner plans · Apr 18, 2025 at 6:42 PM",
    snippet: <>I still think <mark>Aziza in the Richmond</mark> is the move. Get the basteeya.</>,
    reason: "Exact words",
  },
  {
    person: "Jordan Lee",
    source: "Jordan · Weekend plans · Jan 7, 2024 at 11:09 AM",
    snippet: <>Maya was talking about a Moroccan place out in the Richmond last week.</>,
    reason: "Related wording",
  },
];

export function DemoConversation() {
  return (
    <div className="demo-window">
      <div className="demo-sidebar" aria-hidden="true">
        <p className="demo-wordmark">OpenFolio</p>
        <nav>
          <span className="is-active">Search <kbd>⌘K</kbd></span>
          <span>People</span>
          <span>Conversations</span>
          <span>Wrapped</span>
        </nav>
        <p className="demo-status"><i /> On this Mac · Ready</p>
      </div>
      <div className="demo-content">
        <div className="demo-kicker"><span>Search</span><span>2 matches</span></div>
        <label className="demo-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Example search</span>
          <input readOnly value="the Richmond restaurant Maya recommended" />
        </label>
        <div className="demo-results">
          {results.map((result, index) => (
            <article className={index === 0 ? "is-selected" : ""} key={result.source}>
              <div className="demo-result-meta"><strong>{result.person}</strong><span>{result.reason}</span></div>
              <p>{result.snippet}</p>
              <small>{result.source}</small>
            </article>
          ))}
        </div>
      </div>
      <aside className="demo-evidence">
        <div className="demo-kicker"><span>Evidence</span><span>01 / 02</span></div>
        <p className="demo-date">Friday, April 18</p>
        <p className="context-line">Are you still deciding where to go?</p>
        <blockquote>I still think Aziza in the Richmond is the move. Get the basteeya.</blockquote>
        <p className="context-line">perfect, booking it now</p>
        <button type="button" tabIndex={-1}>Open in conversation <ArrowUpRight aria-hidden="true" /></button>
      </aside>
    </div>
  );
}
