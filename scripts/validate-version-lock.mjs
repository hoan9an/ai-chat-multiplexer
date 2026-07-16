import path from "node:path";
import { assertVersionLock } from "./release-utils.mjs";

const tag = process.argv[2];
if (!tag) throw new Error("Usage: node scripts/validate-version-lock.mjs <vX.Y.Z>");
const root = path.resolve(import.meta.dirname, "..");
const version = assertVersionLock(root, tag);
console.log(`Version lock verified: ${tag} (${version})`);
