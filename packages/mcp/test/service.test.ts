import { describe, expect, it } from "vitest";
import { LocalMcpController } from "../src/service.js";

describe("LocalMcpController", () => {
  it("describes stdio setup without pretending a background server is running", async () => {
    const controller = new LocalMcpController();
    const status = await controller.getStatus();

    expect(status.running).toBe(false);
    expect(status.mode).toBe("stdio");
    expect(status.enabled).toBe(false);
    expect(status.details).toContain("MCP is off");

    await expect(controller.start()).resolves.toMatchObject({ running: false, mode: "stdio" });
    await expect(controller.stop()).resolves.toMatchObject({ running: false, mode: "stdio" });
  });

  it("persists enabled state through provided setting callbacks", async () => {
    let enabled = false;
    const controller = new LocalMcpController({
      getEnabled: () => enabled,
      setEnabled: (next) => {
        enabled = next;
      },
    });

    await expect(controller.getSettings()).resolves.toEqual({ enabled: false });
    await expect(controller.setEnabled(true)).resolves.toEqual({ enabled: true });
    await expect(controller.getStatus()).resolves.toMatchObject({ enabled: true });
  });
});
