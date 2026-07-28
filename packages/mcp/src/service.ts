export type LocalMcpControllerOptions = {
  getEnabled?: () => boolean | Promise<boolean>;
  setEnabled?: (enabled: boolean) => void | Promise<void>;
};

export class LocalMcpController {
  private readonly command: string;
  private readonly getEnabledValue: () => boolean | Promise<boolean>;
  private readonly setEnabledValue: (enabled: boolean) => void | Promise<void>;

  constructor(commandOrOptions: string | LocalMcpControllerOptions = "openfolio mcp serve", maybeOptions: LocalMcpControllerOptions = {}) {
    const options = typeof commandOrOptions === "string" ? maybeOptions : commandOrOptions;
    this.command = typeof commandOrOptions === "string" ? commandOrOptions : "openfolio mcp serve";
    this.getEnabledValue = options.getEnabled ?? (() => false);
    this.setEnabledValue = options.setEnabled ?? (() => {});
  }

  async getStatus() {
    const enabled = await this.getEnabledValue();
    return {
      running: false,
      mode: "stdio" as const,
      available: true,
      enabled,
      command: this.command,
      details: enabled
        ? "MCP is enabled. Configured AI clients can start OpenFolio over stdio and request local relationship graph tool results."
        : "MCP is off. Turn it on in OpenFolio Settings before AI clients can request local relationship graph tool results.",
    };
  }

  async start() {
    return this.getStatus();
  }

  async stop() {
    return this.getStatus();
  }

  async getSettings() {
    return {
      enabled: await this.getEnabledValue(),
    };
  }

  async setEnabled(enabled: boolean) {
    await this.setEnabledValue(enabled);
    return this.getSettings();
  }
}
