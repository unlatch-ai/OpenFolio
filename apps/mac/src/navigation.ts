export function shouldOpenExternalUrl(targetUrl: string, currentUrl: string) {
  try {
    const target = new URL(targetUrl);

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return false;
    }

    if (!currentUrl) {
      return true;
    }

    const current = new URL(currentUrl);
    return current.origin !== target.origin;
  } catch {
    return false;
  }
}

const TRUSTED_EXTERNAL_HOSTS = new Set([
  "accounts.google.com",
  "github.com",
  "openfolio.ai",
  "www.openfolio.ai",
]);

const TRUSTED_EXTERNAL_SUFFIXES = [
  ".convex.cloud",
  ".convex.site",
];

function isTrustedHttpsHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return TRUSTED_EXTERNAL_HOSTS.has(normalized)
    || TRUSTED_EXTERNAL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function isAllowedExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return isTrustedHttpsHost(parsed.hostname);
    }

    if (parsed.protocol !== "http:") {
      return false;
    }

    const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
    return isLoopback && parsed.pathname === "/auth/callback";
  } catch {
    return false;
  }
}
