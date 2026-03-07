import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

export function normalizeRedirectTarget(redirectTo?: string | null) {
  const siteUrl = process.env.SITE_URL || process.env.OPENFOLIO_SITE_URL || "http://localhost:3000";

  if (!redirectTo) {
    return `${siteUrl}/account`;
  }

  try {
    const requested = new URL(redirectTo, siteUrl);
    const allowed = new URL(siteUrl);

    if (requested.protocol === "openfolio:") {
      return requested.toString();
    }

    if (
      requested.protocol === "http:" &&
      (requested.hostname === "127.0.0.1" || requested.hostname === "localhost")
    ) {
      return requested.toString();
    }

    if (requested.origin === allowed.origin) {
      return requested.toString();
    }
  } catch {
    return `${siteUrl}/account`;
  }

  return `${siteUrl}/account`;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async redirect({ redirectTo }) {
      return normalizeRedirectTarget(redirectTo);
    },
  },
});
