// SPDX-License-Identifier: Apache-2.0
// The vendored runtime must be exactly what scripts/vendor-runtime.mjs recorded in VENDOR.json:
// every file listed, none changed, none added. The build and verify-remote-release.mjs import
// this before any vendored code, and refuse to go on when it finds a problem.
//
// It catches accidental edits (a hand fix, a merge that touched the folder). It is not a defense
// against someone who changes a file and its recorded SHA-256 together: the commit VENDOR.json
// names is public, so that is checked by vendoring it again.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Every file under `dir` (forward slashes), but VENDOR.json and hidden names. */
export function vendoredFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map((n) => String(n))
    .filter((n) => n !== "VENDOR.json" && !basename(n).startsWith(".") && !statSync(join(dir, n)).isDirectory())
    .map((n) => n.split(sep).join("/"))
    .sort();
}

/** What is wrong with the folder against the recorded SHA-256 map; empty when nothing. */
export function vendorProblems(dir, recorded) {
  if (!recorded || typeof recorded !== "object" || Object.keys(recorded).length === 0) {
    return ["VENDOR.json records no SHA-256 (re-vendor with scripts/vendor-runtime.mjs)"];
  }
  const present = vendoredFiles(dir);
  return [
    ...present.filter((n) => !Object.hasOwn(recorded, n)).map((n) => `${n} is not in VENDOR.json`),
    ...Object.keys(recorded).filter((n) => !present.includes(n)).map((n) => `${n} is missing`),
    ...present
      .filter((n) => Object.hasOwn(recorded, n) && createHash("sha256").update(readFileSync(join(dir, n))).digest("hex") !== recorded[n])
      .map((n) => `${n} differs from its recorded SHA-256`),
  ];
}

/** The repository's own vendor folder: exit 1 with the problems, or return its VENDOR.json. */
export function checkVendoredRuntime() {
  const dir = fileURLToPath(new URL("../vendor/cardvision-browser", import.meta.url));
  const vendor = JSON.parse(readFileSync(join(dir, "VENDOR.json"), "utf-8"));
  const problems = vendorProblems(dir, vendor.sha256);
  if (problems.length > 0) {
    console.error(`vendor/cardvision-browser does not match VENDOR.json:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  return vendor;
}
