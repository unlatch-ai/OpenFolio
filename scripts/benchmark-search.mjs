#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const root = path.resolve(import.meta.dirname, "..");
const coreBuild = path.join(root, "packages/core/dist/packages/core/src/index.js");

if (!fs.existsSync(coreBuild)) {
  console.error("Build packages first with `pnpm build`, then run this benchmark.");
  process.exit(1);
}

const { OpenFolioCore } = await import(coreBuild);

const documentCount = Number(process.env.OPENFOLIO_BENCHMARK_DOCS ?? 10_000);
const iterations = Number(process.env.OPENFOLIO_BENCHMARK_ITERATIONS ?? 10);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openfolio-bench-"));
const dbPath = path.join(tempDir, "openfolio.sqlite");
const core = new OpenFolioCore({ dbPath, aiConfig: null });
const person = core.db.getOrCreatePerson("benchmark@example.com", "Benchmark Person");

for (let index = 0; index < documentCount; index += 1) {
  core.db.createNote("person", person.id, `benchmark note ${index} relationship memory topic ${index % 97}`);
}

core.db.refreshSearchDocuments();
const docs = core.db.getDirtySearchDocuments(documentCount + 10);
for (let index = 0; index < docs.length; index += 1) {
  const vector = [Math.sin(index), Math.cos(index), Math.sin(index % 17)];
  core.db.markSearchDocumentEmbedded(docs[index].id, vector, "local", "benchmark");
}

const durations = [];
for (let index = 0; index < iterations; index += 1) {
  const started = performance.now();
  core.db.search("relationship memory topic", 10, [1, 0, 0]);
  durations.push(performance.now() - started);
}

durations.sort((left, right) => left - right);
const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations.at(-1) ?? 0;
const status = core.getSearchScaleStatus();

console.log(JSON.stringify({
  documentCount,
  iterations,
  p50Ms: Number(p50.toFixed(2)),
  p95Ms: Number(p95.toFixed(2)),
  recommendVectorIndex: status.recommendVectorIndex,
  estimatedVectorMB: Number((status.estimatedVectorBytes / 1024 / 1024).toFixed(2)),
}, null, 2));
