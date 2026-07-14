export type RuntimeNetworkPolicy = Readonly<{
  mode: "production-deny-all" | "development-loopback";
  rendererOrigin: string | null;
}>;

const LOCAL_RESOURCE_PROTOCOLS = new Set(["file:", "data:"]);
const NETWORK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:", "ftp:"]);
const SAFE_SYSTEM_SETTINGS_URLS = new Set([
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts",
]);

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function asWebSocketOrigin(origin: URL) {
  const websocket = new URL(origin.toString());
  websocket.protocol = websocket.protocol === "https:" ? "wss:" : "ws:";
  return websocket.origin;
}

export function createRuntimeNetworkPolicy(isPackaged: boolean, rendererUrl?: string | null): RuntimeNetworkPolicy {
  if (isPackaged) {
    return Object.freeze({ mode: "production-deny-all", rendererOrigin: null });
  }

  if (!rendererUrl) {
    return Object.freeze({ mode: "development-loopback", rendererOrigin: null });
  }

  const parsed = new URL(rendererUrl);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !isLoopbackHostname(parsed.hostname)) {
    throw new Error("The OpenFolio development renderer must use an explicitly configured loopback HTTP(S) origin.");
  }

  return Object.freeze({ mode: "development-loopback", rendererOrigin: parsed.origin });
}

export function isRuntimeRequestAllowed(url: string, policy: RuntimeNetworkPolicy) {
  try {
    const parsed = new URL(url);
    if (LOCAL_RESOURCE_PROTOCOLS.has(parsed.protocol)) {
      return true;
    }

    if (parsed.protocol === "devtools:") {
      return policy.mode === "development-loopback";
    }

    if (!NETWORK_PROTOCOLS.has(parsed.protocol) || policy.mode !== "development-loopback" || !policy.rendererOrigin) {
      return false;
    }

    const rendererOrigin = new URL(policy.rendererOrigin);
    if (!isLoopbackHostname(parsed.hostname)) {
      return false;
    }

    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return parsed.origin === asWebSocketOrigin(rendererOrigin);
    }

    return parsed.origin === rendererOrigin.origin;
  } catch {
    return false;
  }
}

export function isNavigationAllowed(targetUrl: string, currentUrl: string, policy: RuntimeNetworkPolicy) {
  try {
    const target = new URL(targetUrl);
    const current = new URL(currentUrl);

    if (policy.mode === "development-loopback" && policy.rendererOrigin) {
      return target.origin === policy.rendererOrigin && current.origin === policy.rendererOrigin;
    }

    return target.protocol === "file:" && target.href === current.href;
  } catch {
    return false;
  }
}

export function isSafeSystemSettingsUrl(url: string) {
  return SAFE_SYSTEM_SETTINGS_URLS.has(url);
}

// Kept temporarily for shared renderer/main compatibility. Network destinations
// are never delegated to another application under Network Lock.
export function isAllowedExternalUrl(_url: string) {
  return false;
}

export function shouldOpenExternalUrl(_targetUrl: string, _currentUrl: string) {
  return false;
}
