import { Archive, BookOpen, Search, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore, type View } from "../store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "./ui/sidebar";

const ITEMS: Array<{
  id: View;
  icon: typeof Search;
  label: string;
  shortcut?: string;
}> = [
  { id: "search", icon: Search, label: "Search", shortcut: "⌘K" },
  { id: "people", icon: Users, label: "People" },
  { id: "conversations", icon: Archive, label: "Conversations" },
  { id: "wrapped", icon: BookOpen, label: "Year in review" },
];

export function AppSidebar() {
  const { state: sidebarState } = useSidebar();
  const [compactViewport, setCompactViewport] = useState(() =>
    window.matchMedia("(max-width: 1039px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1039px)");
    const update = () => setCompactViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const {
    view,
    setView,
    navigateToSearch,
    messagesStatus,
    importJob,
    embeddingSync,
  } = useAppStore();
  const [status, statusTone] =
    messagesStatus?.status !== "granted"
      ? ["Messages access needed", "warning"]
      : importJob?.status === "running"
        ? [`Importing · ${importJob.importedMessages.toLocaleString()}`, "neutral"]
        : importJob?.status === "cancelling"
          ? ["Cancelling import", "neutral"]
          : importJob?.status === "failed"
            ? ["Import failed", "warning"]
            : importJob?.status === "cancelled"
              ? ["Import cancelled", "warning"]
              : embeddingSync?.syncing
                ? ["On this Mac · Indexing", "neutral"]
                : ["On this Mac · Ready", "success"];

  return (
    <Sidebar collapsible="icon" className="archive-sidebar">
      <SidebarHeader className="archive-sidebar-header">
        <span className="archive-wordmark">OpenFolio</span>
        <span className="archive-edition">PRIVATE · ON THIS MAC</span>
        <span className="archive-monogram">O</span>
      </SidebarHeader>
      <SidebarContent className="archive-sidebar-content">
        <SidebarMenu>
          {ITEMS.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={view === item.id}
                aria-label={item.label}
                onClick={() =>
                  item.id === "search" ? navigateToSearch() : setView(item.id)
                }
                tooltip={{
                  children: item.label,
                  hidden: sidebarState !== "collapsed" && !compactViewport,
                }}
                className="archive-nav-item"
              >
                <item.icon />
                <span>{item.label}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="archive-sidebar-footer">
        <p className={`local-status ${statusTone}`}>
          <span aria-hidden="true">●</span>
          <span>{status}</span>
        </p>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={view === "settings"}
              aria-label="Settings"
              onClick={() => setView("settings")}
              tooltip={{
                children: "Settings",
                hidden: sidebarState !== "collapsed" && !compactViewport,
              }}
              className="archive-nav-item"
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
