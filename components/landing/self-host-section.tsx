import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function SelfHostSection() {
  return (
    <section className="py-20 px-4 bg-muted/30">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-serif font-medium text-center mb-4">
          Self-host OpenFolio
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Run OpenFolio on your own infrastructure. Self-host defaults to
          single-user mode with no signup/login required.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          {/* Who Should Self-Host */}
          <div className="border rounded-lg bg-background p-6 space-y-4">
            <h3 className="text-lg font-semibold">Who Should Self-Host</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Developers comfortable with Docker and the command line
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Teams with strict data privacy requirements
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Anyone who wants full control over their CRM data
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Operators who want private-network deployments
              </li>
            </ul>
          </div>

          {/* What You'll Need */}
          <div className="border rounded-lg bg-background p-6 space-y-4">
            <h3 className="text-lg font-semibold">What You&apos;ll Need</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Docker &amp; Docker Compose
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                An OpenAI API key (for AI features and embeddings)
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                Basic command-line knowledge
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">-</span>
                ~10 minutes for setup
              </li>
            </ul>
          </div>
        </div>

        <div className="bg-background border rounded-lg p-6 text-left font-mono text-sm max-w-2xl mx-auto">
          <p className="text-muted-foreground"># Clone and start</p>
          <p>git clone https://github.com/unlatch-ai/OpenFolio.git</p>
          <p>cd openfolio && ./scripts/setup.sh</p>
          <p>docker compose up -d</p>
          <p className="mt-2 text-muted-foreground"># Open http://localhost:3000 and start using OpenFolio</p>
        </div>

        <div className="text-center mt-8">
          <Button variant="outline" asChild>
            <Link href="/docs/self-hosting">
              Read the Self-Hosting Guide
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
