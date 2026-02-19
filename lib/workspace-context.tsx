"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { getCurrentWorkspaceId, setCurrentWorkspaceId, apiJson } from "@/lib/api";
import type { Workspace } from "@/types";
import { getClientRuntimeMode } from "@/lib/runtime-mode";

interface WorkspaceWithRole extends Workspace {
  role: 'owner' | 'member';
}

interface WorkspaceContextValue {
  currentWorkspace: WorkspaceWithRole | null;
  workspaces: WorkspaceWithRole[];
  workspaceRole: 'owner' | 'member' | null;
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const mode = getClientRuntimeMode();

      if (mode.authMode !== "none") {
        // Claim any pending invites first
        await fetch("/api/auth/claim-invites", { method: "POST" }).catch(() => {});
      }

      const data = await apiJson<{ workspaces: WorkspaceWithRole[] }>("/api/user/workspaces");
      setWorkspaces(data.workspaces);

      // Determine current workspace
      const storedWorkspaceId = getCurrentWorkspaceId();
      const storedWorkspace = data.workspaces.find(w => w.id === storedWorkspaceId);

      if (storedWorkspace) {
        setCurrentWorkspace(storedWorkspace);
      } else if (data.workspaces.length > 0) {
        // Default to first workspace
        setCurrentWorkspace(data.workspaces[0]);
        setCurrentWorkspaceId(data.workspaces[0].id);
      } else {
        setCurrentWorkspace(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      setCurrentWorkspace(workspace);
      setCurrentWorkspaceId(workspaceId);
      // Trigger a page refresh to reload data for new workspace
      window.location.reload();
    }
  }, [workspaces]);

  const value: WorkspaceContextValue = {
    currentWorkspace,
    workspaces,
    workspaceRole: currentWorkspace?.role ?? null,
    isLoading,
    error,
    switchWorkspace,
    refreshWorkspaces: loadWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
