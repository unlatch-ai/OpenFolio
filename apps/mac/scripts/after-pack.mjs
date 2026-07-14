import fs from "node:fs";
import path from "node:path";

export default async function afterPack(context) {
  const resourcesDirectory = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
  for (const updaterMetadata of ["app-update.yml", "latest-mac.yml", "latest.yml"]) {
    fs.rmSync(path.join(resourcesDirectory, updaterMetadata), { force: true });
  }

  const targetArchitecture = context.appOutDir.includes("arm64") ? "arm64" : "x64";
  const onnxBinaryRoot = path.join(
    resourcesDirectory,
    "app.asar.unpacked",
    "node_modules",
    "onnxruntime-node",
    "bin",
    "napi-v6",
  );
  if (!fs.existsSync(path.join(onnxBinaryRoot, "darwin", targetArchitecture))) {
    throw new Error(`Missing ONNX Runtime binaries for darwin/${targetArchitecture}`);
  }
  for (const platform of fs.readdirSync(onnxBinaryRoot)) {
    if (platform !== "darwin") {
      fs.rmSync(path.join(onnxBinaryRoot, platform), { recursive: true, force: true });
    }
  }
  for (const architecture of fs.readdirSync(path.join(onnxBinaryRoot, "darwin"))) {
    if (architecture !== targetArchitecture) {
      fs.rmSync(path.join(onnxBinaryRoot, "darwin", architecture), { recursive: true, force: true });
    }
  }
}
