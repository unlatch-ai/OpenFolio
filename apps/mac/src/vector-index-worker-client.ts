import { utilityProcess, type UtilityProcess } from "electron";

type WorkerResponse =
  | { type: "complete"; indexed: number }
  | { type: "error"; error: string }
  | { type: "paused"; requestId: number };

export class VectorIndexWorkerClient {
  private child: UtilityProcess | null = null;
  private inFlight: Promise<number> | null = null;
  private pauseDepth = 0;
  private nextControlId = 1;
  private pausePromise: Promise<boolean> | null = null;
  private pauseAcks = new Map<number, (paused: boolean) => void>();

  constructor(private readonly workerPath: string) {}

  sync(dbPath: string) {
    if (this.inFlight) return this.inFlight;

    this.inFlight = new Promise<number>((resolve, reject) => {
      const child = utilityProcess.fork(this.workerPath, [], {
        serviceName: "OpenFolio Local Index",
      });
      this.child = child;
      child.on("message", (message: WorkerResponse) => {
        if (message.type === "paused") {
          const acknowledge = this.pauseAcks.get(message.requestId);
          this.pauseAcks.delete(message.requestId);
          acknowledge?.(true);
          return;
        }
        if (this.child !== child) return;
        for (const acknowledge of this.pauseAcks.values()) acknowledge(false);
        this.pauseAcks.clear();
        this.pausePromise = null;
        this.inFlight = null;
        this.child = null;
        child.kill();
        if (message.type === "error") reject(new Error(message.error));
        else resolve(message.indexed);
      });
      child.once("exit", (code) => {
        if (this.child !== child) return;
        this.child = null;
        for (const acknowledge of this.pauseAcks.values()) acknowledge(false);
        this.pauseAcks.clear();
        this.pausePromise = null;
        if (!this.inFlight) return;
        this.inFlight = null;
        reject(new Error(`Local index worker stopped unexpectedly (${code}).`));
      });
      child.postMessage({ type: "sync", dbPath });
      if (this.pauseDepth > 0) child.postMessage({ type: "pause", paused: true, requestId: 0 });
    });
    return this.inFlight;
  }

  async pause() {
    this.pauseDepth += 1;
    if (this.pausePromise) return this.pausePromise;
    const child = this.child;
    if (!child) return false;

    const requestId = this.nextControlId++;
    this.pausePromise = new Promise<boolean>((resolve) => {
      this.pauseAcks.set(requestId, resolve);
      try {
        child.postMessage({ type: "pause", paused: true, requestId });
      } catch {
        this.pauseAcks.delete(requestId);
        resolve(false);
      }
    }).finally(() => {
      this.pausePromise = null;
    });
    return this.pausePromise;
  }

  resume() {
    this.pauseDepth = Math.max(0, this.pauseDepth - 1);
    if (this.pauseDepth !== 0) return;
    try {
      this.child?.postMessage({ type: "pause", paused: false, requestId: 0 });
    } catch {
      // The worker is already exiting; a future sync starts unpaused.
    }
  }
}
