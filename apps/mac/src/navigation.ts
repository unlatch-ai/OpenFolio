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

export function isAllowedExternalUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      return true;
    }

    if (parsed.protocol !== "http:") {
      return false;
    }

    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}
