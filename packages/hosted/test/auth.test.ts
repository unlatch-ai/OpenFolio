import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeRedirectTarget } from "../convex/auth";

const originalSiteUrl = process.env.SITE_URL;
const originalOpenFolioSiteUrl = process.env.OPENFOLIO_SITE_URL;

describe("normalizeRedirectTarget", () => {
  beforeEach(() => {
    process.env.SITE_URL = "https://openfolio.test";
    process.env.OPENFOLIO_SITE_URL = "https://openfolio.test";
  });

  afterEach(() => {
    process.env.SITE_URL = originalSiteUrl;
    process.env.OPENFOLIO_SITE_URL = originalOpenFolioSiteUrl;
  });

  it("allows the desktop callback scheme", () => {
    expect(normalizeRedirectTarget("openfolio://auth/callback")).toBe("openfolio://auth/callback");
  });

  it("allows loopback redirects for the desktop app", () => {
    expect(normalizeRedirectTarget("http://127.0.0.1:38947/auth/callback")).toBe(
      "http://127.0.0.1:38947/auth/callback",
    );
  });

  it("allows redirects on the configured site origin", () => {
    expect(normalizeRedirectTarget("https://openfolio.test/account")).toBe("https://openfolio.test/account");
    expect(normalizeRedirectTarget("/account")).toBe("https://openfolio.test/account");
  });

  it("falls back to the account page for untrusted origins", () => {
    expect(normalizeRedirectTarget("https://example.com/steal-me")).toBe("https://openfolio.test/account");
  });
});
