import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson } from "./release-utils.mjs";

const assetsDir = path.resolve(process.argv[2] ?? "release-assets");
const configPath = path.resolve(process.argv[3] ?? "src-tauri/tauri.conf.json");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-minisign-"));

try {
  const config = readJson(configPath);
  const publicKeyText = Buffer.from(config.plugins.updater.pubkey, "base64").toString("utf8");
  const publicKeyPath = path.join(tempDir, "updater.pub");
  fs.writeFileSync(publicKeyPath, publicKeyText);

  const signatures = fs.readdirSync(assetsDir).filter((file) => file.endsWith(".sig"));
  if (signatures.length === 0) throw new Error("No updater signature assets found");

  for (const signatureFile of signatures) {
    const assetFile = signatureFile.slice(0, -4);
    const assetPath = path.join(assetsDir, assetFile);
    if (!fs.existsSync(assetPath)) throw new Error(`Signature has no asset: ${signatureFile}`);
    const decodedSignature = Buffer.from(
      fs.readFileSync(path.join(assetsDir, signatureFile), "utf8").trim(),
      "base64",
    );
    const decodedPath = path.join(tempDir, `${signatureFile}.decoded`);
    fs.writeFileSync(decodedPath, decodedSignature);
    const result = spawnSync(
      process.env.MINISIGN_BIN ?? "minisign",
      ["-Vm", assetPath, "-p", publicKeyPath, "-x", decodedPath],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(`Updater signature verification failed for ${assetFile}: ${result.stderr || result.stdout}`);
    }
  }
  console.log(`Cryptographically verified ${signatures.length} updater signatures`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
