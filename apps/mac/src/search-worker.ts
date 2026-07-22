import { installNodeNetworkLock, OpenFolioDatabase } from "@openfolio/core";
import type { SearchQueryInput } from "@openfolio/shared-types";

type SearchWorkerRequest = {
  type: "search";
  requestId: number;
  dbPath: string;
  input: SearchQueryInput;
  queryEmbedding?: number[];
};

installNodeNetworkLock();

let db: OpenFolioDatabase | null = null;
let openDbPath: string | null = null;

process.on("exit", () => db?.close());

process.parentPort?.on("message", (event) => {
  const request = event.data as SearchWorkerRequest;
  if (request.type !== "search") return;

  try {
    if (!db || openDbPath !== request.dbPath) {
      db?.close();
      db = new OpenFolioDatabase(request.dbPath, { readOnly: true });
      openDbPath = request.dbPath;
    }
    const results = db.searchRecords(request.input, request.queryEmbedding);
    process.parentPort?.postMessage({ requestId: request.requestId, results });
  } catch (error) {
    process.parentPort?.postMessage({
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "Local search failed.",
    });
  }
});
