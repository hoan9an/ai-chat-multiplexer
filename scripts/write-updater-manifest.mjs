import fs from "node:fs";
import path from "node:path";
import {
  assertSignaturePairs,
  assertVersionLock,
  createUpdaterManifest,
  listAssetFiles,
  RELEASE_REPOSITORY,
  resolveBundleInventory,
} from "./release-utils.mjs";

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const assetsDir = path.resolve(option("--assets", "release-assets"));
const root = path.resolve(option("--root", path.join(import.meta.dirname, "..")));
const tag = option("--tag");
const pubDate = option("--pub-date");
const repository = option("--repository", RELEASE_REPOSITORY);
if (!tag || !pubDate) throw new Error("--tag and --pub-date are required");
if (!fs.existsSync(assetsDir)) throw new Error(`Assets directory not found: ${assetsDir}`);

const version = assertVersionLock(root, tag);
const files = listAssetFiles(assetsDir);
const inventory = resolveBundleInventory(files, version);
assertSignaturePairs(files);
const manifest = createUpdaterManifest({ assetsDir, inventory, version, tag, pubDate, repository });
fs.writeFileSync(
  path.join(assetsDir, "latest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { flag: "wx" },
);
console.log(
  `Wrote merged updater manifest for ${tag} with ${Object.keys(manifest.platforms).length} platform entries`,
);
