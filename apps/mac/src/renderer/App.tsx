import { useEffect, useState } from "react";
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
import { OnboardingView } from "./components/OnboardingView";
import { PeopleView } from "./components/PeopleView";
import { SettingsView } from "./components/SettingsView";
import { getOnboardingState } from "./onboarding";

declare global {
  interface Window {
    openfolio: import("@openfolio/shared-types").OpenFolioBridge;
  }
}

/* ─── Main shell (inside Convex provider) ─── */
function Dashboard() {
  const view = useAppStore((s) => s.view);
  const initialized = useAppStore((s) => s.initialized);
  const messagesStatus = useAppStore((s) => s.messagesStatus);
  const contactsStatus = useAppStore((s) => s.contactsStatus);
  const contactsSync = useAppStore((s) => s.contactsSync);
  const importJob = useAppStore((s) => s.importJob);
  const threads = useAppStore((s) => s.threads);
  const embeddingSync = useAppStore((s) => s.embeddingSync);
  const setupDismissed = useAppStore((s) => s.setupDismissed);

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

  const onboarding = getOnboardingState({
    messagesStatus,
    contactsStatus,
    contactsSync,
    importJob,
    threadCount: threads.length,
    embeddingSync,
    setupDismissed,
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        <div className="window-drag-region" />

        {onboarding.shouldShow ? (
          <OnboardingView />
        ) : (
          <SidebarProvider defaultOpen style={{ height: "100vh" }}>
            <AppSidebar />

            <SidebarInset className="overflow-hidden flex flex-col">
              {view === "inbox" && <InboxView />}
              {view === "people" && <PeopleView />}
              {view === "insights" && <InsightsView />}
              {view === "settings" && <SettingsView />}
            </SidebarInset>
          </SidebarProvider>
        )}

        {!onboarding.shouldShow && <CommandPalette />}
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

  if (!runtimeConfig) {
    return (
      <div className="gate-shell">
        <div className="gate-card">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Preparing
          </p>
          <h1 className="text-xl font-bold tracking-tight">Loading OpenFolio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Preparing your local relationship graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
