import { installNodeNetworkLock, OpenFolioDatabase } from "@openfolio/core";

installNodeNetworkLock();

type VectorIndexWorkerRequest = {
  type: "sync";
  dbPath: string;
} | { type: "pause"; paused: boolean; requestId: number };

let paused = false;

async function waitWhilePaused() {
  while (paused) await new Promise<void>((resolve) => setTimeout(resolve, 25));
}

process.parentPort?.on("message", async (event) => {
  const request = event.data as VectorIndexWorkerRequest;
  if (request.type === "pause") {
    paused = request.paused;
    if (request.paused) {
      process.parentPort?.postMessage({ type: "paused", requestId: request.requestId });
    }
    return;
  }
  if (request.type !== "sync") return;

  let db: OpenFolioDatabase | null = null;
  try {
    db = new OpenFolioDatabase(request.dbPath);
    let indexed = 0;
    while (true) {
      await waitWhilePaused();
      const batchIndexed = db.backfillSearchVectorIndex(250);
      indexed += batchIndexed;
      if (batchIndexed === 0) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    while (true) {
      await waitWhilePaused();
      const batchIndexed = db.backfillSearchBinaryVectorIndex(500);
      indexed += batchIndexed;
      if (batchIndexed === 0) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 15));
    }
    db.close();
    db = null;
    process.parentPort?.postMessage({ type: "complete", indexed });
  } catch (error) {
    db?.close();
    process.parentPort?.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Local vector index sync failed.",
    });
  }
});
