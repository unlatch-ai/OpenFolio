import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="flex flex-col items-center text-center py-24 px-4">
      <h1 className="text-5xl md:text-6xl font-serif font-medium tracking-tight text-foreground max-w-3xl">
        Your relationships,
        <br />
        organized by AI
      </h1>
      <p className="text-xl text-muted-foreground mt-6 max-w-2xl">
        OpenFolio is an open-source, AI-native personal CRM. Import your
        contacts, sync your email, and let AI help you nurture every
        relationship.
      </p>
      <p className="text-sm text-muted-foreground mt-4 max-w-2xl">
        Hosted OpenFolio uses managed authentication and automatic personal
        workspace setup. Self-hosted mode defaults to single-user no-auth on
        your own infrastructure.
      </p>
      <div className="flex gap-4 mt-10">
        <Button size="lg" asChild>
          <Link href="/signup">
            Get Started (Hosted)
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/docs/self-hosting">Self-Host Guide</Link>
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Prefer source first?{" "}
        <a
          href="https://github.com/unlatch-ai/OpenFolio"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          View on GitHub
        </a>
      </p>
    </section>
  );
}
