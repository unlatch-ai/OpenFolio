export class LocalMcpController {
  private running = false;

  getStatus() {
    return { running: this.running };
  }

  async start() {
    this.running = true;
    return this.getStatus();
  }

  async stop() {
    this.running = false;
    return this.getStatus();
  }
}
