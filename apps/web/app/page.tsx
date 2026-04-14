import Link from "next/link";
import {
  MessageSquare,
  Search,
  Bot,
  ArrowRight,
  Shield,
  Terminal as TerminalIcon,
  Sparkles,
  BarChart3,
  Clock,
  Flame,
  Users,
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
    icon: BarChart3,
    title: "Your Wrapped experience",
    description:
      "Top contacts, messaging streaks, busiest hours, monthly trends, and a GitHub-style activity heatmap — all computed locally from your messages.",
    badge: "Insights",
  },
  {
    icon: Search,
    title: "Semantic search",
    description:
      "Cmd+K to search your entire message history using local AI embeddings. No API keys, no cloud, instant results.",
    badge: "Search",
  },
  {
    icon: MessageSquare,
    title: "Conversation browser",
    description:
      "Beautiful two-panel inbox with real-time sync. Messages flow in automatically via FSEvents — no manual imports after setup.",
    badge: "Core",
  },
];

const capabilities = [
  { label: "Messages visualization", status: "local" },
  { label: "Relationship insights", status: "local" },
  { label: "Semantic search", status: "local" },
  { label: "Activity heatmap", status: "local" },
  { label: "MCP server", status: "local" },
  { label: "Identity & billing", status: "hosted" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <Badge variant="outline" className="mb-6">
          <Sparkles className="size-3" />
          100% local, zero cloud required
        </Badge>
        <h1 className="text-5xl font-bold tracking-tight text-foreground max-w-[20ch] leading-[1.08]">
          Spotify Wrapped for your relationships.
        </h1>
        <p className="mt-5 max-w-lg text-base text-muted-foreground leading-relaxed">
          OpenFolio visualizes your iMessage history — top contacts, messaging
          patterns, response times, and streaks. Everything runs locally on your Mac.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <a href="https://github.com/unlatch-ai/OpenFolio">
              View on GitHub
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="https://github.com/unlatch-ai/OpenFolio#building-from-source">Build from Source</a>
          </Button>
        </div>
      </section>

      {/* Live demo conversation */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <DemoConversation />
      </section>

      <Separator />

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          What you get
        </p>
        <h2 className="text-3xl font-bold tracking-tight mb-10">
          Your messages, beautifully visualized.
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
            Three steps to your Wrapped.
          </h2>
          <div className="grid gap-px bg-border sm:grid-cols-3 rounded-xl overflow-hidden border border-border">
            {[
              {
                step: "01",
                icon: Shield,
                title: "Connect",
                description:
                  "Grant Full Disk Access. OpenFolio reads your Messages database in read-only mode — it never sends or modifies messages.",
              },
              {
                step: "02",
                icon: BarChart3,
                title: "Discover",
                description:
                  "See your top contacts, messaging patterns, response times, streaks, and a year-in-review Wrapped dashboard.",
              },
              {
                step: "03",
                icon: Search,
                title: "Search",
                description:
                  "Cmd+K to search across your entire message history with local AI embeddings. No API keys needed.",
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

      {/* Wrapped preview */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Your insights
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-8">
            Everything about your messaging life.
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: "Top contacts", desc: "Who you talk to most" },
              { icon: Clock, label: "Peak hours", desc: "When you're most active" },
              { icon: Flame, label: "Streaks", desc: "Consecutive weeks messaging" },
              { icon: BarChart3, label: "Heatmap", desc: "GitHub-style activity graph" },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="pt-6">
                  <item.icon className="size-5 text-muted-foreground mb-3" />
                  <p className="font-semibold text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Capabilities table */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Privacy first
          </p>
          <h2 className="text-3xl font-bold tracking-tight mb-8">
            Everything runs on your Mac.
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

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            See your relationships in a new light.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Open source. No account required. Your data stays on your Mac.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <a href="https://github.com/unlatch-ai/OpenFolio">
                Get Started
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
