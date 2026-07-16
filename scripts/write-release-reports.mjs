import fs from "node:fs";
import path from "node:path";
import {
  assertVersionLock,
  listAssetFiles,
  sha256File,
} from "./release-utils.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const assetsDir = path.resolve(option("--assets") ?? "release-assets");
const root = path.resolve(option("--root") ?? path.join(import.meta.dirname, ".."));
const tag = option("--tag");
const commitSha = option("--commit");
const workflowRun = option("--workflow-run");
if (!tag || !commitSha || !workflowRun) {
  throw new Error("--tag, --commit and --workflow-run are required");
}
const version = assertVersionLock(root, tag);
const sourceArchive = `ai-chat-multiplexer-${version}-source.tar.gz`;
if (!fs.existsSync(path.join(assetsDir, sourceArchive))) throw new Error("Source archive is missing");

const provenance = {
  schemaVersion: 1,
  tag,
  appVersion: version,
  commitSha,
  workflowRun,
  generatedAt: new Date().toISOString(),
  sourceArchive,
  sourceSha256: sha256File(path.join(assetsDir, sourceArchive)),
  supportedPlatforms: ["windows-x86_64"],
  experimentalPlatforms: ["macos-x86_64", "macos-aarch64", "linux-x86_64"],
};
fs.writeFileSync(
  path.join(assetsDir, "release-provenance.json"),
  `${JSON.stringify(provenance, null, 2)}\n`,
);

const files = listAssetFiles(assetsDir).filter(
  (file) => !["SHA256SUMS.txt", "native-smoke-report.json"].includes(file),
);
const checksumText = files
  .map((file) => `${sha256File(path.join(assetsDir, file))}  ${file}`)
  .join("\n");
fs.writeFileSync(path.join(assetsDir, "SHA256SUMS.txt"), `${checksumText}\n`);

console.log(`Wrote SHA256SUMS.txt and release-provenance.json for ${tag}`);
