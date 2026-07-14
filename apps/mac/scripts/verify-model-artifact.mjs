import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const macDir = path.resolve(scriptDir, "..");
const approvedManifestPath = path.join(macDir, "model", "all-MiniLM-L6-v2.manifest.json");
const approvedManifestText = fs.readFileSync(approvedManifestPath, "utf8");
const manifest = JSON.parse(approvedManifestText);
const appPath = process.argv.slice(2).find((argument) => argument !== "--");

if (!appPath) {
  throw new Error("Usage: pnpm artifact:verify -- /absolute/path/to/OpenFolio.app");
}

const resourcesDir = path.join(path.resolve(appPath), "Contents", "Resources");
const modelDir = path.join(resourcesDir, "models", ...manifest.modelId.split("/"), manifest.revision);
const errors = [];

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

const artifactManifestPath = path.join(modelDir, "manifest.json");
if (!fs.existsSync(artifactManifestPath)) {
  errors.push("model manifest is missing from the app resources");
} else if (fs.readFileSync(artifactManifestPath, "utf8") !== approvedManifestText) {
  errors.push("artifact model manifest does not match the approved source manifest");
}

for (const file of manifest.files) {
  const filePath = path.join(modelDir, file.path);
  if (!fs.existsSync(filePath)) {
    errors.push(`${file.path}: missing from app resources`);
    continue;
  }
  const size = fs.statSync(filePath).size;
  const digest = sha256(filePath);
  if (size !== file.size || digest !== file.sha256) {
    errors.push(`${file.path}: expected ${file.size}/${file.sha256}, found ${size}/${digest}`);
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

const weightCopies = walk(resourcesDir).filter((file) => path.basename(file) === "model_quantized.onnx");
if (weightCopies.length !== 1) {
  errors.push(`expected exactly one quantized model copy, found ${weightCopies.length}`);
}

const targetArchitecture = path.resolve(appPath).includes("arm64") ? "arm64" : "x64";
const onnxBinaryRoot = path.join(resourcesDir, "app.asar.unpacked", "node_modules", "onnxruntime-node", "bin", "napi-v6");
const onnxBinaries = walk(onnxBinaryRoot);
if (onnxBinaries.length === 0) {
  errors.push(`ONNX Runtime binaries are missing for darwin/${targetArchitecture}`);
} else {
  for (const binary of onnxBinaries) {
    const relative = path.relative(onnxBinaryRoot, binary);
    if (!relative.startsWith(path.join("darwin", targetArchitecture, path.sep))) {
      errors.push(`unexpected cross-platform ONNX Runtime binary: ${relative}`);
    }
  }
}

for (const updaterFile of ["app-update.yml", "latest-mac.yml", "latest.yml"]) {
  if (walk(resourcesDir).some((file) => path.basename(file) === updaterFile)) {
    errors.push(`forbidden updater metadata found: ${updaterFile}`);
  }
}

const appAsar = path.join(resourcesDir, "app.asar");
if (!fs.existsSync(appAsar)) {
  errors.push("app.asar is missing");
} else {
  const executableArchive = fs.readFileSync(appAsar);
  const forbiddenCapabilityStrings = [
    "https://huggingface.co/Xenova/all-MiniLM-L6-v2",
    "Xenova/all-MiniLM-L6-v2/resolve/main",
    "cdn-lfs.huggingface.co",
    "node_modules/openai/",
    "node_modules/electron-updater/",
    "people.googleapis.com",
    "gmail.googleapis.com",
    ".convex.cloud",
  ];
  for (const forbidden of forbiddenCapabilityStrings) {
    if (executableArchive.includes(Buffer.from(forbidden))) {
      errors.push(`forbidden network capability string in app.asar: ${forbidden}`);
    }
  }
}

if (process.platform === "darwin") {
  try {
    const entitlements = execFileSync("codesign", ["--display", "--entitlements", ":-", path.resolve(appPath)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const entitlement of ["com.apple.security.network.client", "com.apple.security.network.server"]) {
      if (entitlements.includes(entitlement)) errors.push(`forbidden network entitlement found: ${entitlement}`);
    }
  } catch (error) {
    errors.push(`could not inspect app entitlements: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  throw new Error(`Artifact verification failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

const modelBytes = manifest.files.reduce((total, file) => total + file.size, 0);
process.stdout.write(
  `Verified ${path.resolve(appPath)}: ${manifest.files.length} model/license files, ${modelBytes} bytes, one weight copy, no updater metadata, forbidden network SDK, host, or entitlement\n`,
);
