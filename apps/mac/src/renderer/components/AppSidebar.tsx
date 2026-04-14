import { Inbox, BarChart3, Settings, Search, Zap } from "lucide-react";
import { useAppStore, type View } from "../store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

const NAV_ITEMS: Array<{ id: View; icon: typeof Inbox; label: string }> = [
  { id: "inbox", icon: Inbox, label: "Messages" },
  { id: "insights", icon: BarChart3, label: "Insights" },
];

export function AppSidebar() {
  const { view, setView, messagesStatus, mcpRunning, threads, openCommandPalette } = useAppStore();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 pb-2 pt-8">
        <div className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-white text-xs font-bold shrink-0 shadow-sm">
            O
          </div>
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            OpenFolio
          </span>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Search trigger */}
      <div className="px-3 py-2 group-data-[collapsible=icon]:px-1.5">
        <button
          onClick={openCommandPalette}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 py-1.5 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5"
        >
          <Search size={13} className="shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden flex-1 text-left">Search...</span>
          <kbd className="group-data-[collapsible=icon]:hidden text-[10px] font-mono text-sidebar-foreground/40 border border-sidebar-border rounded px-1">
            {"\u2318"}K
          </kbd>
        </button>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={view === item.id}
                    onClick={() => setView(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    {item.id === "inbox" && threads.length > 0 && (
                      <span className="ml-auto text-[10px] text-sidebar-foreground/40 tabular-nums group-data-[collapsible=icon]:hidden">
                        {threads.length}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Status indicators */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="flex flex-col gap-2 px-3 text-[11px] text-sidebar-foreground/50 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{
                        background: messagesStatus?.status === "granted" ? "var(--accent)" : "var(--border)",
                      }}
                    />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {messagesStatus?.status === "granted" ? "Connected" : "Not connected"}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Messages {messagesStatus?.status === "granted" ? "connected" : "not connected"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <Zap
                      size={10}
                      className="shrink-0"
                      style={{ color: mcpRunning ? "var(--accent)" : "var(--border)" }}
                    />
                    <span className="group-data-[collapsible=icon]:hidden">
                      MCP {mcpRunning ? "on" : "off"}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  MCP {mcpRunning ? "running" : "stopped"}
                </TooltipContent>
              </Tooltip>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={view === "settings"}
              onClick={() => setView("settings")}
              tooltip="Settings"
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
