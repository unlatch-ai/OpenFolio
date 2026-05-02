export class LocalMcpController {
  private readonly command: string;

  constructor(command = "openfolio mcp serve") {
    this.command = command;
  }

  async getStatus() {
    return {
      running: false,
      mode: "stdio" as const,
      available: true,
      command: this.command,
      details: "OpenFolio MCP uses stdio: the configured client starts the local server process when it needs tools. There is no background server to start or stop in the app.",
    };
  }

  async start() {
    return this.getStatus();
  }

  async stop() {
    return this.getStatus();
  }
}
