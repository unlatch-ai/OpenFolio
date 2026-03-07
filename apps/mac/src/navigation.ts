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
