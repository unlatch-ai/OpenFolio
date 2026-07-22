import { utilityProcess, type UtilityProcess } from "electron";

type WorkerResponse = {
  indexed?: number;
  error?: string;
};

export class VectorIndexWorkerClient {
  private child: UtilityProcess | null = null;
  private inFlight: Promise<number> | null = null;

  constructor(private readonly workerPath: string) {}

  sync(dbPath: string) {
    if (this.inFlight) return this.inFlight;

    this.inFlight = new Promise<number>((resolve, reject) => {
      const child = utilityProcess.fork(this.workerPath, [], {
        serviceName: "OpenFolio Local Index",
      });
      this.child = child;
      child.once("message", (message: WorkerResponse) => {
        this.inFlight = null;
        this.child = null;
        child.kill();
        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.indexed ?? 0);
        }
      });
      child.once("exit", (code) => {
        if (!this.inFlight) return;
        this.inFlight = null;
        this.child = null;
        reject(new Error(`Local index worker stopped unexpectedly (${code}).`));
      });
      child.postMessage({ type: "sync", dbPath });
    });
    return this.inFlight;
  }
}
