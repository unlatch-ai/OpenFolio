import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t py-12 px-4">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-sm text-muted-foreground">
          OpenFolio is open source under AGPL-3.0
        </div>
        <div className="flex gap-6 text-sm">
          <a
            href="https://github.com/unlatch-ai/OpenFolio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-muted-foreground hover:text-foreground"
          >
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}
