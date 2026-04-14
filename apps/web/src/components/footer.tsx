import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 text-sm text-muted-foreground">
        <p>OpenFolio</p>
        <div className="flex gap-6">
          <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          <a href="https://github.com/unlatch-ai/OpenFolio" className="hover:text-foreground transition-colors">GitHub</a>
          <Link href="/docs/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}
