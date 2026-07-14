import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const macDir = path.resolve(scriptDir, "..");
const manifestPath = path.join(macDir, "model", "all-MiniLM-L6-v2.manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const cacheRoot = path.join(macDir, ".model-cache", "models");
const modelDir = path.join(cacheRoot, ...manifest.modelId.split("/"), manifest.revision);

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function verifyFile(file) {
  const filePath = path.join(modelDir, file.path);
  if (!fs.existsSync(filePath)) {
    return `${file.path}: missing`;
  }
  const size = fs.statSync(filePath).size;
  if (size !== file.size) {
    return `${file.path}: expected ${file.size} bytes, found ${size}`;
  }
  const digest = sha256(filePath);
  if (digest !== file.sha256) {
    return `${file.path}: expected sha256 ${file.sha256}, found ${digest}`;
  }
  return null;
}

function verifyModel() {
  const errors = manifest.files.map(verifyFile).filter(Boolean);
  const installedManifest = path.join(modelDir, "manifest.json");
  if (!fs.existsSync(installedManifest)) {
    errors.push("manifest.json: missing");
  } else if (fs.readFileSync(installedManifest, "utf8") !== fs.readFileSync(manifestPath, "utf8")) {
    errors.push("manifest.json: does not match the approved manifest");
  }
  return errors;
}

function immutableUrl(file) {
  const repository = file.sourceRepository.split("/").map(encodeURIComponent).join("/");
  const sourcePath = file.sourcePath.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${repository}/resolve/${file.sourceRevision}/${sourcePath}`;
}

async function download(file) {
  const target = path.join(modelDir, file.path);
  const partial = `${target}.partial-${process.pid}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(immutableUrl(file), { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`${file.path}: upstream returned HTTP ${response.status}`);
  }
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: "wx" }));
    const size = fs.statSync(partial).size;
    const digest = sha256(partial);
    if (size !== file.size || digest !== file.sha256) {
      throw new Error(
        `${file.path}: immutable input verification failed (size ${size}, sha256 ${digest})`,
      );
    }
    fs.renameSync(partial, target);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

async function vendorModel() {
  fs.mkdirSync(modelDir, { recursive: true });
  for (const file of manifest.files) {
    if (verifyFile(file) === null) continue;
    fs.rmSync(path.join(modelDir, file.path), { force: true });
    process.stdout.write(`Vendoring ${file.path}\n`);
    await download(file);
  }
  fs.copyFileSync(manifestPath, path.join(modelDir, "manifest.json"));
}

const command = process.argv[2] ?? "verify";
if (command === "vendor") {
  await vendorModel();
} else if (command !== "verify") {
  throw new Error(`Unknown command: ${command}`);
}

const errors = verifyModel();
if (errors.length > 0) {
  throw new Error(`Local model verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

const assetBytes = manifest.files.reduce((total, file) => total + file.size, 0);
process.stdout.write(
  `Verified ${manifest.modelId}@${manifest.revision}: ${manifest.files.length} files, ${assetBytes} bytes, ${manifest.license.spdx}\n`,
);
