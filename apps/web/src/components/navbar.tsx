import Link from "next/link";

export function Navbar() {
  return (
    <header className="site-nav">
      <nav className="section-frame nav-inner" aria-label="Primary navigation">
        <Link href="/" className="wordmark" aria-label="OpenFolio home">OpenFolio</Link>
        <div className="nav-links">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/privacy">Privacy</Link>
          <a href="https://github.com/unlatch-ai/OpenFolio">GitHub</a>
          <a className="nav-download" href="https://github.com/unlatch-ai/OpenFolio/releases/latest">Download</a>
        </div>
      </nav>
    </header>
  );
}
