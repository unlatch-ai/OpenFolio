import { OpenFolioDatabase } from "@openfolio/core";

type VectorIndexWorkerRequest = {
  type: "sync";
  dbPath: string;
};

process.parentPort?.on("message", (event) => {
  const request = event.data as VectorIndexWorkerRequest;
  if (request.type !== "sync") return;

  let db: OpenFolioDatabase | null = null;
  try {
    db = new OpenFolioDatabase(request.dbPath);
    let indexed = 0;
    while (true) {
      const batchIndexed = db.backfillSearchVectorIndex(250);
      indexed += batchIndexed;
      if (batchIndexed === 0) break;
    }
    db.close();
    db = null;
    process.parentPort?.postMessage({ indexed });
  } catch (error) {
    db?.close();
    process.parentPort?.postMessage({
      error: error instanceof Error ? error.message : "Local vector index sync failed.",
    });
  }
});
