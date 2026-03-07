import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-base font-bold tracking-tight text-foreground">
          OpenFolio
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </Link>
          <Link href="/account" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Account
          </Link>
          <a
            href="https://github.com/unlatch-ai/OpenFolio"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <Button asChild size="sm">
            <a href="https://github.com/unlatch-ai/OpenFolio/releases">Download</a>
          </Button>
        </div>
      </div>
    </nav>
  );
}
