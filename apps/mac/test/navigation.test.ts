import { describe, expect, it } from "vitest";
import { shouldOpenExternalUrl } from "../src/navigation";

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
});
