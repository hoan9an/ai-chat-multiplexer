import fs from "node:fs";
import path from "node:path";
import {
  assertExactAssetSet,
  assertSignaturePairs,
  assertUniqueAssets,
  assertVersionLock,
  expectedReleaseFiles,
  listAssetFiles,
  readJson,
  requireOne,
  resolveBundleInventory,
  sha256File,
  validateUpdaterManifest,
  validateSmokeReport,
  validateAuthenticodeReport,
  verifyChecksums,
} from "./release-utils.mjs";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const assetsDir = path.resolve(option("--assets", "release-assets"));
const root = path.resolve(option("--root", path.join(import.meta.dirname, "..")));
const tag = option("--tag");
const phase = option("--phase", "build");
const expectedCommit = option("--commit");
if (!tag) throw new Error("--tag is required");
if (!fs.existsSync(assetsDir)) throw new Error(`Assets directory not found: ${assetsDir}`);

const version = assertVersionLock(root, tag);
const files = listAssetFiles(assetsDir);
assertUniqueAssets(files);
for (const file of files) {
  if (fs.statSync(path.join(assetsDir, file)).size === 0) throw new Error(`Empty asset: ${file}`);
}

const inventory = resolveBundleInventory(files, version);
assertSignaturePairs(files);
assertExactAssetSet(files, expectedReleaseFiles(inventory, version, phase), `${phase} release`);

const latestFile = requireOne(files, /^latest\.json$/, "Tauri updater manifest");
const latest = readJson(path.join(assetsDir, latestFile));
validateUpdaterManifest(latest, { assetsDir, inventory, version, tag });

if (phase === "automated" || phase === "publish") {
  const source = requireOne(
    files,
    new RegExp(`^ai-chat-multiplexer-${version.replaceAll(".", "\\.")}-source\\.tar\\.gz$`),
    "source archive",
  );
  requireOne(files, /^SHA256SUMS\.txt$/, "checksum inventory");
  const provenanceFile = requireOne(files, /^release-provenance\.json$/, "release provenance");
  const provenance = readJson(path.join(assetsDir, provenanceFile));
  if (provenance.tag !== tag || provenance.appVersion !== version || !provenance.commitSha) {
    throw new Error("Release provenance does not match tag/version/commit");
  }
  if (expectedCommit && provenance.commitSha !== expectedCommit) {
    throw new Error(`Release provenance commit is ${provenance.commitSha}, expected ${expectedCommit}`);
  }
  if (provenance.sourceArchive !== source) throw new Error("Provenance source archive mismatch");
  if (provenance.sourceSha256 !== sha256File(path.join(assetsDir, source))) {
    throw new Error("Provenance source archive hash mismatch");
  }
  if (!Number.isFinite(Date.parse(provenance.generatedAt)) || !provenance.workflowRun) {
    throw new Error("Release provenance is missing generation context");
  }
  verifyChecksums(
    assetsDir,
    files.filter(
      (file) =>
        file !== "SHA256SUMS.txt" &&
        file !== "native-smoke-report.json",
    ),
  );
  const authenticodeFile = requireOne(
    files,
    /^authenticode-report\.json$/,
    "Authenticode verification report",
  );
  validateAuthenticodeReport(readJson(path.join(assetsDir, authenticodeFile)), {
    assetsDir,
    requiredAssets: [inventory.windowsExe, inventory.windowsMsi],
  });
}

if (phase === "publish") {
  const smokeFile = requireOne(files, /^native-smoke-report\.json$/, "native smoke report");
  validateSmokeReport(readJson(path.join(assetsDir, smokeFile)), { tag, version, assetsDir });
}

console.log(`Release assets verified for ${tag} at phase ${phase}: ${files.length} files`);
