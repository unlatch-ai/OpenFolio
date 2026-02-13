import {
  Users,
  Search,
  Sparkles,
  Mail,
  Server,
  Puzzle,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "People & Companies",
    description:
      "Track contacts, companies, and interactions in one place. Tag, filter, and organize your entire network.",
  },
  {
    icon: Mail,
    title: "Email & Calendar Sync",
    description:
      "Connect Gmail and Google Calendar to automatically import interactions and keep your CRM up to date.",
  },
  {
    icon: Search,
    title: "Semantic Search",
    description:
      "Search your network by meaning, not just keywords. Find people by expertise, past conversations, or shared context.",
  },
  {
    icon: Sparkles,
    title: "AI Assistant",
    description:
      "Ask questions about your network in natural language. Get relationship insights, follow-up suggestions, and more.",
  },
  {
    icon: Puzzle,
    title: "Extensible Connectors",
    description:
      "Import from CSV, LinkedIn, or build your own connector. The modular gateway makes it easy to add new data sources.",
  },
  {
    icon: Server,
    title: "Self-Hostable",
    description:
      "Run OpenFolio on your own infrastructure with Docker Compose. Your data stays on your servers.",
  },
];

export function Features() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-serif font-medium text-center mb-12">
          Everything you need to manage your network
        </h2>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
