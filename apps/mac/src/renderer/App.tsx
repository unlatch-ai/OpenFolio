import { TooltipProvider } from "@/renderer/components/ui/tooltip";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";
import { Toaster } from "@/renderer/components/ui/sonner";
import { useTheme } from "@/lib/use-theme";
import { useAppStore } from "./store";
import { useAppData } from "./hooks/use-app-data";
import { AppSidebar } from "./components/AppSidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InboxView } from "./components/InboxView";
import { InsightsView } from "./components/InsightsView";
import { OnboardingView } from "./components/OnboardingView";
import { PeopleView } from "./components/PeopleView";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { getOnboardingState } from "./onboarding";

declare global {
  interface Window { openfolio: import("@openfolio/shared-types").OpenFolioBridge; }
}

function RendererShell() {
  const state = useAppStore();
  useAppData();

  if (!state.initialized) {
    return <div className="gate-shell"><div className="gate-card"><p>Preparing your private archive</p><h1>OpenFolio</h1></div></div>;
  }

  const onboarding = getOnboardingState({
    messagesStatus: state.messagesStatus,
    importJob: state.importJob,
    threadCount: state.threads.length,
    setupDismissed: state.setupDismissed,
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-shell">
        <div className="window-drag-region" />
        {onboarding.shouldShow ? (
          <OnboardingView />
        ) : (
          <SidebarProvider defaultOpen style={{ height: "100vh", "--sidebar-width": "232px", "--sidebar-width-icon": "56px" } as React.CSSProperties}>
            <AppSidebar />
            <SidebarInset className="renderer-canvas">
              <>
                {state.view === "search" && <SearchView />}
                {state.view === "people" && <PeopleView />}
                {state.view === "conversations" && <InboxView />}
                {state.view === "wrapped" && <InsightsView />}
                {state.view === "settings" && <SettingsView />}
              </>
            </SidebarInset>
          </SidebarProvider>
        )}
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

export function App() {
  useTheme();
  return <ErrorBoundary><RendererShell /></ErrorBoundary>;
}
