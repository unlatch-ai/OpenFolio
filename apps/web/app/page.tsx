import Link from "next/link";
import {
  MessageSquare,
  Search,
  Bot,
  ArrowRight,
  Shield,
  Terminal as TerminalIcon,
  Sparkles,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DemoConversation } from "@/components/demo-conversation";

const features = [
  {
    icon: MessageSquare,
    title: "Messages-first graph",
    description:
      "Read-only iMessage import turns your Mac into a relationship memory layer instead of another CRM form.",
    badge: "Core",
  },
  {
    icon: Search,
    title: "Local search + AI",
    description:
      "Keyword, semantic, and ask-style search run against your local graph before any hosted service is involved.",
    badge: "AI",
  },
  {
    icon: Bot,
    title: "Agent access via MCP",
    description:
      "MCP and CLI surfaces let your own agents interact with your data using explicit local scopes.",
    badge: "Dev",
  },
];

const capabilities = [
  { label: "Messages import", status: "local" },
  { label: "Semantic search", status: "local" },
  { label: "AI answers", status: "local + hosted" },
  { label: "MCP server", status: "local" },
  { label: "Identity & billing", status: "hosted" },
  { label: "Managed connectors", status: "coming" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <Badge variant="outline" className="mb-6">
          <Sparkles className="size-3" />
          macOS app + optional hosted services
        </Badge>
        <h1 className="text-5xl font-bold tracking-tight text-foreground max-w-[18ch] leading-[1.08]">
          Relationship intelligence that lives on your Mac.
        </h1>
        <p className="mt-5 max-w-lg text-base text-muted-foreground leading-relaxed">
          OpenFolio imports your Messages into a local graph you can search,
          query with AI, and expose to your agents — no cloud required.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <a href="https://github.com/unlatch-ai/OpenFolio/releases">
              Download for macOS
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="https://github.com/unlatch-ai/OpenFolio">View on GitHub</a>
          </Button>
        </div>
      </section>

      {/* Live demo conversation */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <DemoConversation />
      </section>

      <Separator />

      {/* Features — asymmetric bento */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          What ships in v1
        </p>
        <h2 className="text-3xl font-bold tracking-tight mb-10">
          Three pillars, one local graph.
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Card
              key={feature.title}
              className={i === 0 ? "sm:col-span-2 lg:col-span-1" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <feature.icon className="size-5 text-muted-foreground" />
                  <Badge variant="secondary">{feature.badge}</Badge>
                </div>
                <CardTitle className="mt-2">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* How it works */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            How it works
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-12">
            Three steps to your relationship graph.
          </h2>
          <div className="grid gap-px bg-border sm:grid-cols-3 rounded-xl overflow-hidden border border-border">
            {[
              {
                step: "01",
                icon: Shield,
                title: "Import",
                description:
                  "Grant Full Disk Access. OpenFolio reads your Messages database into a local SQLite graph — read-only, never modifies the original.",
              },
              {
                step: "02",
                icon: Search,
                title: "Search",
                description:
                  "Keyword, semantic, and natural language queries across your entire relationship history. Results stay on your Mac.",
              },
              {
                step: "03",
                icon: Sparkles,
                title: "Ask",
                description:
                  "AI-grounded answers with citations from your local data. Use your own key or upgrade to hosted AI.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-background p-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex items-center justify-center size-8 rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
                    {item.step}
                  </span>
                  <item.icon className="size-4 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Capabilities table */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Local vs hosted
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-8">
            You choose what stays local.
          </h2>
          <Card>
            <CardContent className="pt-6">
              <div className="divide-y divide-border">
                {capabilities.map((cap) => (
                  <div
                    key={cap.label}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="text-sm font-medium">{cap.label}</span>
                    <Badge
                      variant={
                        cap.status === "coming" ? "outline" : "secondary"
                      }
                    >
                      {cap.status === "local" && (
                        <Shield className="size-3 text-accent" />
                      )}
                      {cap.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* MCP / Terminal section */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            <div>
              <Badge variant="outline" className="mb-4">
                <TerminalIcon className="size-3" />
                For developers
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight">
                Built for agents.
              </h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                OpenFolio exposes your relationship graph through MCP and CLI.
                Your agents can query contacts, search messages, and access
                follow-up suggestions — all scoped to explicit local permissions.
              </p>
              <div className="mt-6 flex gap-2">
                <Badge variant="secondary">MCP Server</Badge>
                <Badge variant="secondary">CLI</Badge>
                <Badge variant="secondary">SQLite</Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-foreground/[0.03] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                </div>
                <span className="text-xs text-muted-foreground ml-2">
                  Terminal
                </span>
              </div>
              <pre className="p-4 text-sm font-mono text-foreground/80 leading-relaxed overflow-x-auto">
                <code>{`$ openfolio mcp start
  MCP server listening on stdio

$ openfolio search "last conversation with Sarah"
  3 results from local graph

$ openfolio ask "who should I follow up with?"
  Based on your message history:
  1. Alex Chen — no reply in 12 days
  2. Jordan Lee — mentioned meeting next week`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* Docs */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-3xl font-bold tracking-tight mb-8">
            Documentation
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                href: "/docs/getting-started",
                title: "Getting Started",
                desc: "Install the Mac app, grant Full Disk Access, and import Messages.",
              },
              {
                href: "/docs/architecture",
                title: "Architecture",
                desc: "Local SQLite graph, Electron shell, MCP package, and Convex hosted services.",
              },
              {
                href: "/docs/privacy",
                title: "Privacy",
                desc: "What stays on-device and what can go to hosted services.",
              },
              {
                href: "/docs/deployment",
                title: "Deployment",
                desc: "GitHub Releases, Vercel docs site, and Convex hosted services.",
              },
            ].map((doc) => (
              <Link key={doc.href} href={doc.href} className="group">
                <Card className="transition-colors group-hover:border-foreground/20 h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {doc.title}
                      <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{doc.desc}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to try OpenFolio?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Download the Mac app. No account required.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <a href="https://github.com/unlatch-ai/OpenFolio/releases">
                Download for macOS
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
