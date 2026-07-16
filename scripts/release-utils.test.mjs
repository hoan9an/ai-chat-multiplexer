import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createUpdaterManifest,
  expectedReleaseFiles,
  listAssetFiles,
  resolveBundleInventory,
  sha256File,
  validateAuthenticodeReport,
  validateSmokeReport,
} from "./release-utils.mjs";

test("candidate and publish workflows serialize mutations for the same tag", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const candidate = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  const publish = fs.readFileSync(
    path.join(root, ".github", "workflows", "publish-release.yml"),
    "utf8",
  );
  assert.match(candidate, /group:\s*release-\$\{\{\s*github\.ref_name\s*\}\}/);
  assert.match(publish, /group:\s*release-\$\{\{\s*inputs\.tag\s*\}\}/);
  assert.doesNotMatch(candidate, /group:\s*release-candidate-/);
  assert.doesNotMatch(publish, /group:\s*publish-release-/);
});

test("release workflows do not rely on working-tree-only gitattributes", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const candidate = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(candidate, /git archive --format=tar\.gz/);
  assert.doesNotMatch(candidate, /\.gitattributes/);
});

test("smoke report requires every case to pass and binds the tested artifact hash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-release-test-"));
  try {
    const installer = "AI.Chat.Multiplexer_1.2.3_x64-setup.exe";
    fs.writeFileSync(path.join(dir, installer), "installer");
    const valid = {
      schemaVersion: 1,
      tag: "v1.2.3",
      appVersion: "1.2.3",
      testedArtifact: installer,
      testedArtifactSha256: sha256File(path.join(dir, installer)),
      windowsVersion: "Windows 11 24H2",
      webview2Version: "136.0",
      testedAt: "2026-07-16T00:00:00.000Z",
      tester: "release-qa",
      evidenceRef: "PRIVATE-EVIDENCE-001",
      cases: {
        authenticode: "PASS",
        cleanInstall: "PASS",
        firstRun: "PASS",
        existingUpgrade: "PASS",
        updaterInstallRestart: "PASS",
        newTabLanguages: "PASS",
        multiPaneProfiles: "PASS",
        popupAndOAuth: "PASS",
        download: "PASS",
        configBackupRestore: "PASS",
        fullBackupRestoreAndInvalidArchive: "PASS",
        restartPersistence: "PASS",
        uninstallRelaunch: "PASS",
      },
      notes: "",
    };
    validateSmokeReport(valid, { tag: "v1.2.3", version: "1.2.3", assetsDir: dir });
    assert.throws(
      () => validateSmokeReport({ ...valid, cases: { ...valid.cases, download: "FAIL" } }, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
      }),
      /not green/,
    );
    assert.throws(
      () => validateSmokeReport({ ...valid, testedArtifact: `../${installer}` }, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
      }),
      /tested artifact evidence/,
    );
    assert.throws(
      () => validateSmokeReport({ ...valid, extra: "unexpected" }, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
      }),
      /schema mismatch/,
    );
    assert.throws(
      () => validateSmokeReport({
        ...valid,
        cases: { ...valid.cases, unreviewedCase: "PASS" },
      }, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
      }),
      /cases mismatch/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publish smoke policy allows updater restart to be deferred until after publication", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-release-smoke-policy-"));
  try {
    const installer = "AI.Chat.Multiplexer_1.2.3_x64-setup.exe";
    fs.writeFileSync(path.join(dir, installer), "installer");
    const valid = {
      schemaVersion: 1,
      tag: "v1.2.3",
      appVersion: "1.2.3",
      testedArtifact: installer,
      testedArtifactSha256: sha256File(path.join(dir, installer)),
      windowsVersion: "Windows 11 24H2",
      webview2Version: "136.0",
      testedAt: "2026-07-16T00:00:00.000Z",
      tester: "release-qa",
      evidenceRef: "PRIVATE-EVIDENCE-001",
      cases: Object.fromEntries([
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
      ].map((name) => [name, "PASS"])),
      notes: "",
    };
    const deferredUpdater = {
      ...valid,
      cases: { ...valid.cases, updaterInstallRestart: "BLOCKED" },
    };
    validateSmokeReport(deferredUpdater, {
      tag: "v1.2.3",
      version: "1.2.3",
      assetsDir: dir,
      requireUpdater: false,
    });
    assert.throws(
      () => validateSmokeReport(deferredUpdater, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
      }),
      /not green/,
    );
    assert.throws(
      () => validateSmokeReport({
        ...valid,
        cases: { ...valid.cases, updaterInstallRestart: "FAIL" },
      }, {
        tag: "v1.2.3",
        version: "1.2.3",
        assetsDir: dir,
        requireUpdater: false,
      }),
      /not green/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeCompleteReleaseFixture(dir) {
  const root = path.resolve(import.meta.dirname, "..");
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const tag = `v${version}`;
  const products = [
    `AI.Chat.Multiplexer_${version}_x64-setup.exe`,
    `AI.Chat.Multiplexer_${version}_x64_en-US.msi`,
    `AI.Chat.Multiplexer_${version}_amd64.AppImage`,
    `AI.Chat.Multiplexer_${version}_amd64.deb`,
    `AI.Chat.Multiplexer-${version}-1.x86_64.rpm`,
    "AI.Chat.Multiplexer_x64.app.tar.gz",
    "AI.Chat.Multiplexer_aarch64.app.tar.gz",
    `AI.Chat.Multiplexer_${version}_x64.dmg`,
    `AI.Chat.Multiplexer_${version}_aarch64.dmg`,
  ];
  for (const file of products) fs.writeFileSync(path.join(dir, file), `fixture:${file}`);

  const preSignatureFiles = listAssetFiles(dir);
  const inventory = resolveBundleInventory(preSignatureFiles, version);
  const updaterProducts = new Set([
    inventory.windowsExe,
    inventory.windowsMsi,
    inventory.linuxAppImage,
    inventory.linuxDeb,
    inventory.linuxRpm,
    inventory.macX64Bundle,
    inventory.macArmBundle,
  ]);
  for (const file of updaterProducts) {
    fs.writeFileSync(path.join(dir, `${file}.sig`), Buffer.from(`fixture-signature:${file}`.repeat(8)).toString("base64"));
  }

  const manifest = createUpdaterManifest({
    assetsDir: dir,
    inventory,
    version,
    tag,
    pubDate: "2026-07-16T00:00:00.000Z",
  });
  fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(manifest));

  const signedAssets = [inventory.windowsExe, inventory.windowsMsi].map((name) => ({
    name,
    sha256: sha256File(path.join(dir, name)),
    status: "Valid",
    signerSubject: "CN=Fixture Signer",
    timestampSubject: "CN=Fixture Timestamp",
  }));
  fs.writeFileSync(
    path.join(dir, "authenticode-report.json"),
    JSON.stringify({
      schemaVersion: 1,
      required: false,
      verifiedAt: "2026-07-16T00:00:00.000Z",
      assets: signedAssets,
    }),
  );

  const sourceArchive = `ai-chat-multiplexer-${version}-source.tar.gz`;
  fs.writeFileSync(path.join(dir, sourceArchive), "source fixture");
  fs.writeFileSync(
    path.join(dir, "release-provenance.json"),
    JSON.stringify({
      schemaVersion: 1,
      tag,
      appVersion: version,
      commitSha: "fixture-commit",
      workflowRun: "https://example.invalid/run/1",
      generatedAt: "2026-07-16T00:00:00.000Z",
      sourceArchive,
      sourceSha256: sha256File(path.join(dir, sourceArchive)),
    }),
  );
  const checksumFiles = listAssetFiles(dir).filter(
    (file) => !["SHA256SUMS.txt", "native-smoke-report.json"].includes(file),
  );
  fs.writeFileSync(
    path.join(dir, "SHA256SUMS.txt"),
    `${checksumFiles.map((file) => `${sha256File(path.join(dir, file))}  ${file}`).join("\n")}\n`,
  );

  fs.writeFileSync(
    path.join(dir, "native-smoke-report.json"),
    JSON.stringify({
      schemaVersion: 1,
      tag,
      appVersion: version,
      testedArtifact: inventory.windowsExe,
      testedArtifactSha256: sha256File(path.join(dir, inventory.windowsExe)),
      windowsVersion: "Windows 11 24H2",
      webview2Version: "136.0",
      testedAt: "2026-07-16T00:00:00.000Z",
      tester: "release-qa",
      evidenceRef: "PRIVATE-EVIDENCE-001",
      cases: Object.fromEntries([
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
      ].map((name) => [name, "PASS"])),
      notes: "",
    }),
  );
  return { inventory, tag, version };
}

test("Authenticode report requires the exact signed Windows asset inventory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-authenticode-test-"));
  try {
    const requiredAssets = ["installer.exe", "installer.msi"];
    for (const name of [...requiredAssets, "stale.exe"]) {
      fs.writeFileSync(path.join(dir, name), `fixture:${name}`);
    }
    const entry = (name) => ({
      name,
      sha256: sha256File(path.join(dir, name)),
      status: "Valid",
      signerSubject: "CN=Fixture Signer",
      timestampSubject: "CN=Fixture Timestamp",
    });
    const valid = {
      schemaVersion: 1,
      required: true,
      verifiedAt: "2026-07-16T00:00:00.000Z",
      assets: requiredAssets.map(entry),
    };
    validateAuthenticodeReport(valid, { assetsDir: dir, requiredAssets });
    validateAuthenticodeReport({
      ...valid,
      required: false,
      assets: requiredAssets.map((name) => ({
        name,
        sha256: sha256File(path.join(dir, name)),
        status: "NotSigned",
        signerSubject: null,
        timestampSubject: null,
      })),
    }, { assetsDir: dir, requiredAssets });
    assert.throws(
      () => validateAuthenticodeReport({ ...valid, assets: [entry(requiredAssets[0])] }, {
        assetsDir: dir,
        requiredAssets,
      }),
      /asset inventory mismatch/,
    );
    assert.throws(
      () => validateAuthenticodeReport({
        ...valid,
        assets: [...valid.assets, entry("stale.exe")],
      }, {
        assetsDir: dir,
        requiredAssets,
      }),
      /asset inventory mismatch/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("complete publish fixture passes exact release inventory verification", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-release-fixture-"));
  try {
    const { inventory, tag, version } = writeCompleteReleaseFixture(dir);
    assert.deepEqual(
      listAssetFiles(dir),
      expectedReleaseFiles(inventory, version, "publish").sort(),
    );
    assert.deepEqual(
      listAssetFiles(dir).filter((file) => file !== "native-smoke-report.json"),
      expectedReleaseFiles(inventory, version, "publish", { requireSmoke: false }).sort(),
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "verify-release-assets.mjs"),
        "--assets",
        dir,
        "--tag",
        tag,
        "--phase",
        "publish",
        "--commit",
        "fixture-commit",
      ],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    fs.rmSync(path.join(dir, "native-smoke-report.json"));
    const betaPublish = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "verify-release-assets.mjs"),
        "--assets",
        dir,
        "--tag",
        tag,
        "--phase",
        "publish",
        "--commit",
        "fixture-commit",
        "--require-smoke",
        "false",
      ],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" },
    );
    assert.equal(betaPublish.status, 0, betaPublish.stderr || betaPublish.stdout);

    fs.writeFileSync(path.join(dir, "stale-installer.exe"), "stale");
    const stale = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "verify-release-assets.mjs"),
        "--assets",
        dir,
        "--tag",
        tag,
        "--phase",
        "publish",
      ],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" },
    );
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /inventory mismatch|Missing updater signature asset/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publish verification rejects stale and duplicate checksum entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aicm-release-checksums-"));
  try {
    const { tag } = writeCompleteReleaseFixture(dir);
    const verifierArgs = [
      path.join(import.meta.dirname, "verify-release-assets.mjs"),
      "--assets",
      dir,
      "--tag",
      tag,
      "--phase",
      "publish",
      "--commit",
      "fixture-commit",
    ];
    const checksumPath = path.join(dir, "SHA256SUMS.txt");
    const original = fs.readFileSync(checksumPath, "utf8");

    fs.writeFileSync(checksumPath, `${original}${"0".repeat(64)}  stale-artifact.exe\n`);
    const stale = spawnSync(process.execPath, verifierArgs, {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /SHA256SUMS inventory mismatch/);

    const firstLine = original.split(/\r?\n/).find(Boolean);
    fs.writeFileSync(checksumPath, `${original}${firstLine}\n`);
    const duplicate = spawnSync(process.execPath, verifierArgs, {
      cwd: path.resolve(import.meta.dirname, ".."),
      encoding: "utf8",
    });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /Duplicate SHA256SUMS entry/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
