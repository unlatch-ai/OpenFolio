"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  BookUser,
  Settings,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquare,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { href: "/app", label: "Home", icon: LayoutDashboard },
  { href: "/app/people", label: "People", icon: Users },
  { href: "/app/companies", label: "Companies", icon: Building2 },
  { href: "/app/interactions", label: "Interactions", icon: MessageSquare },
  { href: "/app/ask", label: "Ask AI", icon: Lightbulb },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

interface SidebarNavProps {
  user: {
    id: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
    organization?: {
      id: string;
      name: string;
    };
  };
}

function NavContent({ user, pathname, onNavigate }: SidebarNavProps & { pathname: string; onNavigate?: () => void }) {
  const handleLogout = async () => {
    // Client-side logout - will redirect to login
    window.location.href = "/logout";
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6">
        <Link href="/" className="flex items-center space-x-2" onClick={onNavigate}>
          <span className="text-xl font-bold text-slate-900">OpenFolio</span>
        </Link>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive ? "text-slate-900" : "text-slate-500")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* User Info & Logout */}
      <div className="p-4 space-y-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
              {getInitials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {user.full_name || "User"}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {user.organization?.name || user.email}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          className="w-full justify-start space-x-3 text-slate-600 hover:text-slate-900"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </Button>
      </div>
    </div>
  );
}

export function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[250px] bg-slate-50 border-r border-slate-200 flex-col h-screen sticky top-0">
        <NavContent user={user} pathname={pathname} />
      </aside>

      {/* Mobile Sidebar */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-40 bg-white shadow-sm border border-slate-200"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 bg-slate-50">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>
            <NavContent 
              user={user} 
              pathname={pathname} 
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

// Re-export for convenience
export { navItems };
export type { NavItem };
