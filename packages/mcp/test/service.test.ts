import { describe, expect, it } from "vitest";
import { LocalMcpController } from "../src/service.js";

describe("LocalMcpController", () => {
  it("describes stdio setup without pretending a background server is running", async () => {
    const controller = new LocalMcpController();
    const status = await controller.getStatus();

    expect(status.running).toBe(false);
    expect(status.mode).toBe("stdio");
    expect(status.details).toContain("client starts");

    await expect(controller.start()).resolves.toMatchObject({ running: false, mode: "stdio" });
    await expect(controller.stop()).resolves.toMatchObject({ running: false, mode: "stdio" });
  });
});
