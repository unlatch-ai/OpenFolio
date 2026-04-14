import { useEffect, useMemo, useState } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { CloudRuntimeConfig } from "@openfolio/shared-types";
import { TooltipProvider } from "@/renderer/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/renderer/components/ui/sidebar";
import { Toaster } from "@/renderer/components/ui/sonner";
import { useTheme } from "@/lib/use-theme";
import { useAppStore } from "./store";
import { useAppData } from "./hooks/use-app-data";
import { AppSidebar } from "./components/AppSidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InboxView } from "./components/InboxView";
import { InsightsView } from "./components/InsightsView";
import { SettingsView } from "./components/SettingsView";

declare global {
  interface Window {
    openfolio: import("@openfolio/shared-types").OpenFolioBridge;
  }
}

/* ─── Main shell (inside Convex provider) ─── */
function Dashboard() {
  const view = useAppStore((s) => s.view);
  const initialized = useAppStore((s) => s.initialized);

  // Bootstrap data
  useAppData();

  if (!initialized) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Preparing
          </p>
          <h1 className="text-xl font-bold tracking-tight">Loading OpenFolio...</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Setting up your local relationship graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        <div className="window-drag-region" />

        <SidebarProvider defaultOpen style={{ height: "100vh" }}>
          <AppSidebar />

          <SidebarInset className="overflow-hidden flex flex-col">
            {view === "inbox" && <InboxView />}
            {view === "insights" && <InsightsView />}
            {view === "settings" && <SettingsView />}
          </SidebarInset>
        </SidebarProvider>

        <CommandPalette />
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

/* ─── Root: Convex provider + config ─── */
export function App() {
  const [runtimeConfig, setRuntimeConfig] = useState<CloudRuntimeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const setCloudConfig = useAppStore((s) => s.setCloudConfig);

  useTheme();

  useEffect(() => {
    window.openfolio.cloud
      .getConfig()
      .then((config) => {
        setRuntimeConfig(config);
        setCloudConfig(config);
      })
      .catch((error) => {
        setConfigError(error instanceof Error ? error.message : "Failed to load configuration.");
      });
  }, [setCloudConfig]);

  const convexClient = useMemo(() => {
    if (!runtimeConfig?.convexUrl) return null;
    return new ConvexReactClient(runtimeConfig.convexUrl);
  }, [runtimeConfig?.convexUrl]);

  if (configError) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Configuration error
          </p>
          <h1 className="text-xl font-bold tracking-tight">Could not start OpenFolio</h1>
          <p className="mt-2 text-sm text-destructive">{configError}</p>
        </div>
      </div>
    );
  }

  if (!runtimeConfig || !convexClient) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Preparing
          </p>
          <h1 className="text-xl font-bold tracking-tight">Loading OpenFolio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Preparing your local graph and hosted connection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ConvexAuthProvider client={convexClient}>
        <Dashboard />
      </ConvexAuthProvider>
    </ErrorBoundary>
  );
}
