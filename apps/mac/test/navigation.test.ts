import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl, shouldOpenExternalUrl } from "../src/navigation";

describe("navigation helpers", () => {
  it("keeps same-origin app routes inside the Electron window", () => {
    expect(shouldOpenExternalUrl("http://localhost:5173/account", "http://localhost:5173/")).toBe(false);
  });

  it("opens different origins in the external browser", () => {
    expect(shouldOpenExternalUrl("https://blessed-pig-525.convex.site/api/auth/signin/google", "http://localhost:5173/")).toBe(true);
    expect(shouldOpenExternalUrl("https://accounts.google.com/o/oauth2/v2/auth", "http://localhost:5173/")).toBe(true);
  });

  it("opens all http urls externally from packaged file builds", () => {
    expect(shouldOpenExternalUrl("https://openfolio.ai/account", "file:///Applications/OpenFolio.app/index.html")).toBe(true);
  });

  it("only allows external URL schemes and loopback http targets that OpenFolio expects", () => {
    expect(isAllowedExternalUrl("https://openfolio.ai/docs/privacy")).toBe(true);
    expect(isAllowedExternalUrl("http://127.0.0.1:1234/auth/callback")).toBe(true);
    expect(isAllowedExternalUrl("http://localhost:1234/auth/callback")).toBe(true);
    expect(isAllowedExternalUrl("http://evil.example/auth/callback")).toBe(false);
    expect(isAllowedExternalUrl("file:///Users/me/.ssh/id_rsa")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("not a url")).toBe(false);
  });
});
