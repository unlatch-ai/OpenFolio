import { Archive, BookOpen, Search, Settings, Users } from "lucide-react";
import { useAppStore, type View } from "../store";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator } from "./ui/sidebar";

const ITEMS: Array<{ id: View; icon: typeof Search; label: string; shortcut?: string }> = [
  { id: "search", icon: Search, label: "Search", shortcut: "⌘K" },
  { id: "people", icon: Users, label: "People" },
  { id: "conversations", icon: Archive, label: "Conversations" },
  { id: "wrapped", icon: BookOpen, label: "Wrapped" },
];

export function AppSidebar() {
  const { view, setView, navigateToSearch, messagesStatus, importJob, embeddingSync } = useAppStore();
  const status = messagesStatus?.status !== "granted"
    ? "Messages access needed"
    : importJob?.status === "running"
      ? `Importing · ${importJob.importedMessages.toLocaleString()}`
      : embeddingSync?.syncing
        ? "On this Mac · Indexing"
        : "On this Mac · Ready";

  return (
    <Sidebar collapsible="icon" className="archive-sidebar">
      <SidebarHeader className="archive-sidebar-header"><span className="archive-wordmark">OpenFolio</span><span className="archive-monogram">O</span></SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="archive-sidebar-content">
        <SidebarMenu>
          {ITEMS.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={view === item.id}
                onClick={() => item.id === "search" ? navigateToSearch() : setView(item.id)}
                tooltip={item.label}
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
        <p className="local-status"><span aria-hidden="true">●</span><span>{status}</span></p>
        <SidebarSeparator />
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive={view === "settings"} onClick={() => setView("settings")} tooltip="Settings" className="archive-nav-item"><Settings /><span>Settings</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
