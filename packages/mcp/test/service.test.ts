import { describe, expect, it } from "vitest";
import { LocalMcpController } from "../src/service.js";

describe("LocalMcpController", () => {
  it("tracks start and stop state", async () => {
    const controller = new LocalMcpController();
    expect(controller.getStatus()).toEqual({ running: false });
    await controller.start();
    expect(controller.getStatus()).toEqual({ running: true });
    await controller.stop();
    expect(controller.getStatus()).toEqual({ running: false });
  });
});
