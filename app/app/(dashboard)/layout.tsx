import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { MobileNav } from "./mobile-nav";
import { navItems } from "./nav-items";
import ClaimInvitesOnAuth from "@/components/auth/ClaimInvitesOnAuth";
import { getRuntimeMode, isHostedInviteOnlySignup } from "@/lib/runtime-mode";
import { ensureSelfHostedContext } from "@/lib/selfhost/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensurePersonalWorkspace, ensureProfile } from "@/lib/workspaces/provision";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isE2EBypass = process.env.E2E_BYPASS_AUTH === "1";
  const mode = getRuntimeMode();
  const noAuthMode = mode.authMode === "none";

  let userName = "Test User";
  let userEmail = "test@example.com";
  let userInitials = "TU";
  if (noAuthMode) {
    const context = await ensureSelfHostedContext();
    userName = process.env.OPENFOLIO_SELFHOST_DEFAULT_NAME || "Local User";
    userEmail = context.userEmail;
    userInitials = "LU";
  } else if (!isE2EBypass) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    // Check if user has any workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      if (isHostedInviteOnlySignup()) {
        redirect("/login?error=invite_required");
      }
      const admin = createAdminClient();
      await ensureProfile(admin, {
        userId: user.id,
        email: user.email,
        fullName: (user.user_metadata?.full_name as string | undefined) || null,
      });
      await ensurePersonalWorkspace(admin, {
        userId: user.id,
        fullName: (user.user_metadata?.full_name as string | undefined) || null,
      });
    }

    userName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split("@")[0] ||
      "User";
    userEmail = user.email || "";
    userInitials = String(userName)
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <WorkspaceProvider>
      <div className="min-h-screen flex bg-background">
        {!noAuthMode ? <ClaimInvitesOnAuth /> : null}
        {/* Sidebar - Warm Editorial Style */}
        <aside className="hidden md:flex w-60 border-r border-border bg-sidebar flex-col">
          {/* Logo & Org Switcher */}
          <div className="p-5 pb-4">
            <Link href="/app" className="flex items-center gap-2.5 group mb-3">
              <div className="w-8 h-8 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                <Image
                  src="/brand/logo-mark.png"
                  alt="OpenFolio logo"
                  width={32}
                  height={32}
                  className="h-8 w-8"
                />
              </div>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                OpenFolio
              </span>
            </Link>
            {!noAuthMode ? <WorkspaceSwitcher /> : null}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2">
            <div className="space-y-0.5">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Settings link - separated */}
            <div className="mt-6 pt-6 border-t border-border">
              <Link
                href="/app/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors group"
              >
                <Settings className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span>Settings</span>
              </Link>
            </div>
          </nav>

          {/* User Section */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar className="h-8 w-8 ring-1 ring-border">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
            </div>
            {!noAuthMode ? (
              <div className="mt-2">
                <LogoutButton />
              </div>
            ) : null}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-h-screen">
          <MobileNav
            userName={userName}
            userEmail={userEmail}
            userInitials={userInitials}
          />
          <div className="flex-1 p-4 md:p-8 overflow-auto scrollbar-thin">
            {children}
          </div>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
