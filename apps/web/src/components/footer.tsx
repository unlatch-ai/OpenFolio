import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="section-frame footer-inner">
        <p>OpenFolio · Private message recall for macOS</p>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/docs">Docs</Link>
          <Link href="/docs/getting-started">Install</Link>
          <Link href="/docs/privacy">Privacy</Link>
          <a href="https://github.com/unlatch-ai/OpenFolio">Source</a>
          <a href="https://github.com/unlatch-ai/OpenFolio/blob/main/LICENSE">AGPL-3.0</a>
        </nav>
      </div>
    </footer>
  );
}
