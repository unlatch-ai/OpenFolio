import { utilityProcess, type UtilityProcess } from "electron";
import type { SearchQueryInput, SearchResult } from "@openfolio/shared-types";

type PendingRequest = {
  resolve: (results: SearchResult[]) => void;
  reject: (error: Error) => void;
};

type WorkerResponse = {
  requestId: number;
  results?: SearchResult[];
  error?: string;
};

export class SearchWorkerClient {
  private child: UtilityProcess | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private activeRequestId: number | null = null;
  private queuedRequest: { requestId: number; dbPath: string; input: SearchQueryInput; queryEmbedding?: number[] } | null = null;
  private requestTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly workerPath: string) {}

  private ensureChild() {
    if (this.child) return this.child;

    const child = utilityProcess.fork(this.workerPath, [], {
      serviceName: "OpenFolio Interactive Search",
    });
    this.child = child;
    child.on("message", (message: WorkerResponse) => {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      if (message.requestId !== this.activeRequestId) return;
      if (this.requestTimeout) clearTimeout(this.requestTimeout);
      this.requestTimeout = null;
      this.activeRequestId = null;
      this.pending.delete(message.requestId);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.results ?? []);
      this.dispatchQueued();
    });
    child.on("exit", (code) => {
      if (this.child !== child) return;
      const error = new Error(`Interactive search worker stopped unexpectedly (${code}).`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.activeRequestId = null;
      this.queuedRequest = null;
      if (this.requestTimeout) clearTimeout(this.requestTimeout);
      this.requestTimeout = null;
      this.child = null;
    });
    return child;
  }

  search(dbPath: string, input: SearchQueryInput, queryEmbedding?: number[]) {
    const requestId = this.nextRequestId++;
    const result = new Promise<SearchResult[]>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    const request = { requestId, dbPath, input, queryEmbedding };
    if (this.activeRequestId != null) {
      if (this.queuedRequest) {
        this.pending.get(this.queuedRequest.requestId)?.reject(new Error("Search superseded by a newer query."));
        this.pending.delete(this.queuedRequest.requestId);
      }
      this.queuedRequest = request;
    } else {
      this.dispatch(request);
    }
    return result;
  }

  close() {
    const error = new Error("Interactive search worker closed.");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.queuedRequest = null;
    this.activeRequestId = null;
    if (this.requestTimeout) clearTimeout(this.requestTimeout);
    this.requestTimeout = null;
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  private dispatch(request: { requestId: number; dbPath: string; input: SearchQueryInput; queryEmbedding?: number[] }) {
    this.activeRequestId = request.requestId;
    try {
      this.ensureChild().postMessage({ type: "search", ...request });
      this.requestTimeout = setTimeout(() => {
        const pending = this.pending.get(request.requestId);
        this.pending.delete(request.requestId);
        this.activeRequestId = null;
        pending?.reject(new Error("Local search timed out."));
        const timedOutChild = this.child;
        this.child = null;
        timedOutChild?.kill();
        this.dispatchQueued();
      }, 30_000);
    } catch (error) {
      const pending = this.pending.get(request.requestId);
      this.activeRequestId = null;
      this.pending.delete(request.requestId);
      pending?.reject(error instanceof Error ? error : new Error("Local search failed."));
      const child = this.child;
      this.child = null;
      child?.kill();
      const workerError = error instanceof Error ? error : new Error("Local search failed.");
      for (const queued of this.pending.values()) queued.reject(workerError);
      this.pending.clear();
      this.queuedRequest = null;
    }
  }

  private dispatchQueued() {
    const request = this.queuedRequest;
    this.queuedRequest = null;
    if (request) this.dispatch(request);
  }
}
