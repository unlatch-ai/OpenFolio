/**
 * Client-side API fetch helper that auto-includes workspace context.
 */

const WORKSPACE_STORAGE_KEY = "openfolio_current_workspace_id";
// Legacy key for backward compatibility during transition
const LEGACY_ORG_STORAGE_KEY = "openfolio_legacy_workspace_id";

export function getCurrentWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  // Try new key first, fallback to legacy
  return localStorage.getItem(WORKSPACE_STORAGE_KEY)
    || localStorage.getItem(LEGACY_ORG_STORAGE_KEY);
}

export function setCurrentWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
}

export function clearCurrentWorkspaceId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ORG_STORAGE_KEY);
}

/**
 * Fetch wrapper that auto-includes x-workspace-id header
 */
export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const workspaceId = getCurrentWorkspaceId();

  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
      ...(workspaceId && { "x-workspace-id": workspaceId }),
    },
  });
}

/**
 * Convenience wrapper that parses JSON response
 */
export async function apiJson<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}
