"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Removes the "dark" class from <html> when outside /docs.
 *
 * Nextra's ThemeProvider (next-themes) adds class="dark" to the <html> element
 * when the docs pages are visited. Because <html> persists across client-side
 * navigations, the dark class leaks to non-docs pages. This component strips
 * it so the landing page and app always render in light mode.
 */
export function ForceLightMode() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/docs")) {
      const html = document.documentElement;
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }
  }, [pathname]);

  return null;
}
