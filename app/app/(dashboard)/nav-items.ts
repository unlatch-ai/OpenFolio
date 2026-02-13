import {
  Building2,
  Home,
  MessageSquare,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

export const navItems = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/people", label: "People", icon: Users },
  { href: "/app/companies", label: "Companies", icon: Building2 },
  { href: "/app/interactions", label: "Interactions", icon: MessageSquare },
  { href: "/app/ask", label: "Ask AI", icon: Sparkles },
  { href: "/app/search", label: "Search", icon: Search },
];
