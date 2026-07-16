import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RELEASE_REPOSITORY = "hoan9an/ai-chat-multiplexer";

const UPDATE_PLATFORM_KEYS = [
  "darwin-x86_64",
  "darwin-x86_64-app",
  "darwin-aarch64",
  "darwin-aarch64-app",
  "linux-x86_64",
  "linux-x86_64-appimage",
  "linux-x86_64-deb",
  "linux-x86_64-rpm",
  "windows-x86_64",
  "windows-x86_64-msi",
  "windows-x86_64-nsis",
];

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function repositoryVersions(root) {
  const packageVersion = readJson(path.join(root, "package.json")).version;
  const tauriVersion = readJson(path.join(root, "src-tauri", "tauri.conf.json")).version;
  const cargo = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const appCore = fs.readFileSync(path.join(root, "src", "appCore.ts"), "utf8");
  const appVersion = appCore.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
  return { packageVersion, tauriVersion, cargoVersion, appVersion };
}

export function assertVersionLock(root, tag) {
  const versions = repositoryVersions(root);
  const expected = tag.replace(/^v/, "");
  const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
  if (mismatches.length > 0) {
    throw new Error(
      `Version lock failed for ${tag}: ${mismatches
        .map(([source, version]) => `${source}=${version ?? "missing"}`)
        .join(", ")}`,
    );
  }
  return expected;
}

export function listAssetFiles(assetsDir) {
  return fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export function assertUniqueAssets(files) {
  const duplicate = files.find((file, index) => files.indexOf(file) !== index);
  if (duplicate) throw new Error(`Duplicate release asset: ${duplicate}`);
}

export function requireOne(files, pattern, label) {
  const matches = files.filter((file) => pattern.test(file));
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one asset, found ${matches.length}`);
  }
  return matches[0];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveBundleInventory(files, version) {
  const escapedVersion = escapeRegExp(version);
  return {
    windowsExe: requireOne(
      files,
      new RegExp(`_${escapedVersion}_x64-setup\\.exe$`),
      "Windows NSIS installer",
    ),
    windowsMsi: requireOne(
      files,
      new RegExp(`_${escapedVersion}_x64_en-US\\.msi$`),
      "Windows MSI installer",
    ),
    linuxAppImage: requireOne(
      files,
      new RegExp(`_${escapedVersion}_amd64\\.AppImage$`),
      "Linux AppImage",
    ),
    linuxDeb: requireOne(
      files,
      new RegExp(`_${escapedVersion}_amd64\\.deb$`),
      "Linux DEB",
    ),
    linuxRpm: requireOne(
      files,
      new RegExp(`-${escapedVersion}-1\\.x86_64\\.rpm$`),
      "Linux RPM",
    ),
    macX64Bundle: requireOne(files, /_x64\.app\.tar\.gz$/, "macOS x64 updater bundle"),
    macArmBundle: requireOne(
      files,
      /_aarch64\.app\.tar\.gz$/,
      "macOS arm64 updater bundle",
    ),
    macX64Dmg: requireOne(
      files,
      new RegExp(`_${escapedVersion}_x64\\.dmg$`),
      "macOS x64 DMG",
    ),
    macArmDmg: requireOne(
      files,
      new RegExp(`_${escapedVersion}_aarch64\\.dmg$`),
      "macOS arm64 DMG",
    ),
  };
}

export function updaterPlatformAssets(inventory) {
  return {
    "darwin-x86_64": inventory.macX64Bundle,
    "darwin-x86_64-app": inventory.macX64Bundle,
    "darwin-aarch64": inventory.macArmBundle,
    "darwin-aarch64-app": inventory.macArmBundle,
    "linux-x86_64": inventory.linuxAppImage,
    "linux-x86_64-appimage": inventory.linuxAppImage,
    "linux-x86_64-deb": inventory.linuxDeb,
    "linux-x86_64-rpm": inventory.linuxRpm,
    "windows-x86_64": inventory.windowsMsi,
    "windows-x86_64-msi": inventory.windowsMsi,
    "windows-x86_64-nsis": inventory.windowsExe,
  };
}

export function updaterAssetNames(inventory) {
  return [...new Set(Object.values(updaterPlatformAssets(inventory)))].sort();
}

export function assertExactAssetSet(files, expectedFiles, label) {
  const actual = [...files].sort();
  const expected = [...new Set(expectedFiles)].sort();
  const missing = expected.filter((file) => !actual.includes(file));
  const unexpected = actual.filter((file) => !expected.includes(file));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label} inventory mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`,
    );
  }
}

export function expectedReleaseFiles(inventory, version, phase) {
  const products = Object.values(inventory);
  const updaterAssets = updaterAssetNames(inventory);
  const expected = [
    ...products,
    ...updaterAssets.map((file) => `${file}.sig`),
    "latest.json",
    "authenticode-report.json",
  ];
  if (phase === "automated" || phase === "publish") {
    expected.push(
      `ai-chat-multiplexer-${version}-source.tar.gz`,
      "SHA256SUMS.txt",
      "release-provenance.json",
    );
  }
  if (phase === "publish") expected.push("native-smoke-report.json");
  return expected;
}

export function assertSignaturePairs(files) {
  const signedExtensions = [".AppImage", ".deb", ".rpm", ".msi", ".exe", ".app.tar.gz"];
  files
    .filter((file) => signedExtensions.some((extension) => file.endsWith(extension)))
    .forEach((file) => {
      if (!files.includes(`${file}.sig`)) {
        throw new Error(`Missing updater signature asset for ${file}`);
      }
    });
}

function signatureText(assetsDir, assetName) {
  const value = fs.readFileSync(path.join(assetsDir, `${assetName}.sig`), "utf8").trim();
  if (value.length < 100 || !/^[A-Za-z0-9+/=\r\n]+$/.test(value)) {
    throw new Error(`Invalid updater signature encoding for ${assetName}`);
  }
  return value;
}

export function createUpdaterManifest({
  assetsDir,
  inventory,
  version,
  tag,
  pubDate,
  repository = RELEASE_REPOSITORY,
  notes = "",
}) {
  if (!Number.isFinite(Date.parse(pubDate))) throw new Error(`Invalid updater pub_date: ${pubDate}`);
  const platforms = {};
  const platformAssets = updaterPlatformAssets(inventory);
  for (const key of UPDATE_PLATFORM_KEYS) {
    const assetName = platformAssets[key];
    platforms[key] = {
      signature: signatureText(assetsDir, assetName),
      url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`,
    };
  }
  return { version, notes, pub_date: new Date(pubDate).toISOString(), platforms };
}

export function validateUpdaterManifest(
  manifest,
  { assetsDir, inventory, version, tag, repository = RELEASE_REPOSITORY },
) {
  if (manifest.version !== version) {
    throw new Error(`latest.json version is ${manifest.version}, expected ${version}`);
  }
  if (typeof manifest.notes !== "string" || !Number.isFinite(Date.parse(manifest.pub_date))) {
    throw new Error("latest.json notes or pub_date is invalid");
  }

  const actualKeys = Object.keys(manifest.platforms ?? {}).sort();
  const expectedKeys = [...UPDATE_PLATFORM_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `latest.json platform keys mismatch; expected=${expectedKeys.join(",")}, actual=${actualKeys.join(",")}`,
    );
  }

  const expectedAssets = updaterPlatformAssets(inventory);
  for (const key of UPDATE_PLATFORM_KEYS) {
    const entry = manifest.platforms[key];
    const assetName = expectedAssets[key];
    if (!entry || typeof entry.url !== "string") throw new Error(`${key} has no updater URL`);
    const parsed = new URL(entry.url);
    const expectedPath = `/${repository}/releases/download/${tag}/${assetName}`;
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      decodeURIComponent(parsed.pathname) !== expectedPath
    ) {
      throw new Error(`${key} updater URL does not match the release asset`);
    }
    if (entry.signature !== signatureText(assetsDir, assetName)) {
      throw new Error(`${key} embedded signature does not match ${assetName}.sig`);
    }
  }
}

export function parseChecksums(file) {
  const lines = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const checksums = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`);
    if (checksums.has(match[2])) {
      throw new Error(`Duplicate SHA256SUMS entry: ${match[2]}`);
    }
    checksums.set(match[2], match[1].toLowerCase());
  }
  return checksums;
}

export function verifyChecksums(assetsDir, requiredFiles) {
  const checksums = parseChecksums(path.join(assetsDir, "SHA256SUMS.txt"));
  const required = [...new Set(requiredFiles)].sort();
  const listed = [...checksums.keys()].sort();
  const missing = required.filter((file) => !checksums.has(file));
  const unexpected = listed.filter((file) => !required.includes(file));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `SHA256SUMS inventory mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`,
    );
  }
  for (const file of required) {
    const expected = checksums.get(file);
    const actual = sha256File(path.join(assetsDir, file));
    if (actual !== expected) throw new Error(`SHA256 mismatch for ${file}`);
  }
}

export function validateSmokeReport(report, { tag, version, assetsDir, requireUpdater = true }) {
  const requiredFields = [
    "schemaVersion",
    "tag",
    "appVersion",
    "testedArtifact",
    "testedArtifactSha256",
    "windowsVersion",
    "webview2Version",
    "testedAt",
    "tester",
    "evidenceRef",
    "cases",
    "notes",
  ];
  const fields = Object.keys(report ?? {}).sort();
  const unexpectedFields = fields.filter((field) => !requiredFields.includes(field));
  const missingFields = requiredFields.filter((field) => !(field in (report ?? {})));
  if (unexpectedFields.length > 0 || missingFields.length > 0) {
    throw new Error(
      `Smoke report schema mismatch; missing=[${missingFields.join(", ")}], unexpected=[${unexpectedFields.join(", ")}]`,
    );
  }
  if (report.schemaVersion !== 1) throw new Error("Unsupported smoke report schema");
  if (report.tag !== tag || report.appVersion !== version) {
    throw new Error("Smoke report tag/version does not match the release");
  }
  if (
    typeof report.testedArtifact !== "string" ||
    path.basename(report.testedArtifact) !== report.testedArtifact ||
    !/_x64-setup\.exe$/i.test(report.testedArtifact) ||
    typeof report.testedArtifactSha256 !== "string" ||
    !/^[a-f\d]{64}$/i.test(report.testedArtifactSha256)
  ) {
    throw new Error("Smoke report is missing tested artifact evidence");
  }
  if (!listAssetFiles(assetsDir).includes(report.testedArtifact)) {
    throw new Error("Smoke-tested artifact is not in the release inventory");
  }
  const artifactPath = path.join(assetsDir, report.testedArtifact);
  if (sha256File(artifactPath) !== report.testedArtifactSha256.toLowerCase()) {
    throw new Error("Smoke report artifact SHA256 does not match the release asset");
  }
  const safeEvidenceId = /^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/;
  if (
    typeof report.windowsVersion !== "string" ||
    report.windowsVersion.length > 120 ||
    !/^Windows (?:10|11) [A-Za-z0-9 .()_-]+$/.test(report.windowsVersion) ||
    typeof report.webview2Version !== "string" ||
    !/^\d+(?:\.\d+){1,3}$/.test(report.webview2Version) ||
    typeof report.evidenceRef !== "string" ||
    !safeEvidenceId.test(report.evidenceRef) ||
    typeof report.tester !== "string" ||
    !safeEvidenceId.test(report.tester) ||
    typeof report.notes !== "string" ||
    report.notes.length > 200 ||
    /[/\\?#@]|\b(?:cookie|token|password|secret|prompt|chat content|private key)\b/i.test(report.notes) ||
    !Number.isFinite(Date.parse(report.testedAt))
  ) {
    throw new Error("Smoke report is missing Windows/WebView2/evidence context");
  }
  const requiredCases = [
    "authenticode",
    "cleanInstall",
    "firstRun",
    "existingUpgrade",
    "updaterInstallRestart",
    "newTabLanguages",
    "multiPaneProfiles",
    "popupAndOAuth",
    "download",
    "configBackupRestore",
    "fullBackupRestoreAndInvalidArchive",
    "restartPersistence",
    "uninstallRelaunch",
  ];
  const cases = report.cases ?? {};
  const missing = requiredCases.filter((name) => !(name in cases));
  const unexpectedCases = Object.keys(cases).filter((name) => !requiredCases.includes(name));
  if (missing.length > 0 || unexpectedCases.length > 0) {
    throw new Error(
      `Smoke report cases mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpectedCases.join(", ")}]`,
    );
  }
  const failed = requiredCases
    .map((name) => [name, cases[name]])
    .filter(([name, result]) => {
      if (!requireUpdater && name === "updaterInstallRestart") {
        return !["PASS", "BLOCKED", "NOT-TESTED"].includes(result);
      }
      return result !== "PASS";
    });
  if (failed.length > 0) {
    throw new Error(`Smoke gate is not green: ${failed.map(([name, value]) => `${name}=${value}`).join(", ")}`);
  }
}

export function validateAuthenticodeReport(report, { assetsDir, requiredAssets }) {
  if (
    report.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(report.verifiedAt)) ||
    !Array.isArray(report.assets)
  ) {
    throw new Error("Invalid Authenticode report schema");
  }
  const reportedNames = report.assets.map((asset) => asset.name).sort();
  const expectedNames = [...requiredAssets].sort();
  if (
    reportedNames.length !== expectedNames.length ||
    reportedNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error("Authenticode report asset inventory mismatch");
  }
  for (const name of requiredAssets) {
    const entry = report.assets.find((asset) => asset.name === name);
    if (!entry) throw new Error(`Authenticode report is missing ${name}`);
    if (entry.status !== "Valid" || !entry.signerSubject || !entry.timestampSubject) {
      throw new Error(`Authenticode is not valid and timestamped for ${name}`);
    }
    if (entry.sha256?.toLowerCase() !== sha256File(path.join(assetsDir, name))) {
      throw new Error(`Authenticode report hash mismatch for ${name}`);
    }
  }
}
