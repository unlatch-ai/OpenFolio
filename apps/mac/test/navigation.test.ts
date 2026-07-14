import { describe, expect, it } from "vitest";
import {
  createRuntimeNetworkPolicy,
  isAllowedExternalUrl,
  isNavigationAllowed,
  isRuntimeRequestAllowed,
  isSafeSystemSettingsUrl,
} from "../src/navigation";

describe("Network Lock policy", () => {
  it("creates an immutable production deny-all policy", () => {
    const policy = createRuntimeNetworkPolicy(true, "https://evil.example");

    expect(policy).toEqual({ mode: "production-deny-all", rendererOrigin: null });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(isRuntimeRequestAllowed("file:///Applications/OpenFolio.app/index.html", policy)).toBe(true);
    expect(isRuntimeRequestAllowed("data:image/png;base64,AA==", policy)).toBe(true);
    expect(isRuntimeRequestAllowed("https://openfolio.ai", policy)).toBe(false);
    expect(isRuntimeRequestAllowed("wss://openfolio.ai/socket", policy)).toBe(false);
    expect(isRuntimeRequestAllowed("http://127.0.0.1:5173", policy)).toBe(false);
    expect(isRuntimeRequestAllowed("ftp://127.0.0.1/file", policy)).toBe(false);
  });

  it("allows only the exact configured loopback development origin", () => {
    const policy = createRuntimeNetworkPolicy(false, "http://127.0.0.1:5173/app");

    expect(isRuntimeRequestAllowed("http://127.0.0.1:5173/@vite/client", policy)).toBe(true);
    expect(isRuntimeRequestAllowed("ws://127.0.0.1:5173/?token=dev", policy)).toBe(true);
    expect(isRuntimeRequestAllowed("http://localhost:5173/@vite/client", policy)).toBe(false);
    expect(isRuntimeRequestAllowed("http://127.0.0.1:5174/", policy)).toBe(false);
    expect(isRuntimeRequestAllowed("https://example.com/", policy)).toBe(false);
  });

  it("rejects a non-loopback development renderer", () => {
    expect(() => createRuntimeNetworkPolicy(false, "https://example.com/app")).toThrow(/loopback/i);
  });

  it("allows same-origin development navigation and no external delegation", () => {
    const development = createRuntimeNetworkPolicy(false, "http://localhost:5173/");
    const production = createRuntimeNetworkPolicy(true);

    expect(isNavigationAllowed("http://localhost:5173/settings", "http://localhost:5173/", development)).toBe(true);
    expect(isNavigationAllowed("https://openfolio.ai", "http://localhost:5173/", development)).toBe(false);
    expect(isNavigationAllowed("https://openfolio.ai", "file:///Applications/OpenFolio.app/index.html", production)).toBe(false);
    expect(isAllowedExternalUrl("https://github.com/unlatch-ai/OpenFolio/releases")).toBe(false);
  });

  it("preserves only local macOS System Settings actions", () => {
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts")).toBe(true);
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")).toBe(true);
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")).toBe(false);
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts&url=https://evil.example")).toBe(false);
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences:com.apple.preference.security/../network?Privacy_Contacts")).toBe(false);
    expect(isSafeSystemSettingsUrl("x-apple.systempreferences://com.apple.preference.security?Privacy_Contacts")).toBe(false);
    expect(isSafeSystemSettingsUrl("https://support.apple.com")).toBe(false);
    expect(isSafeSystemSettingsUrl("file:///Users/me/.ssh/id_rsa")).toBe(false);
  });
});
