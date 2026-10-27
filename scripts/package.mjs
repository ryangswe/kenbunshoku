// SPDX-License-Identifier: Apache-2.0
// Zip the built extension (scripts/package-zip.mjs has the two layouts):
//   - a release build: <packageName>-<version>.zip (packageName from kenbunshoku.config.json),
//     holding one folder of the same name, which is what a user selects in Chrome's "Load unpacked";
//   - a Web Store build (--store, no key): <packageName>-<version>-store.zip with manifest.json at
//     the top level, as the Chrome Web Store requires.
//
//   npm run build -- --release <release folder> [--store]
//   npm run package
//
// It refuses a dev build. It uploads nothing: publishing the zip is a person's decision.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadForkConfig } from "./fork-config.mjs";
import { writeZip, zipLayout } from "./package-zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
if (!existsSync(join(dist, "manifest.json"))) {
  console.error("no dist/manifest.json: run npm run build -- --release <folder> first");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf-8"));
const config = loadForkConfig();
if (manifest.name !== config.name) {
  console.error(`dist/ is a "${manifest.name}" build; package a release build (no --dev)`);
  process.exit(1);
}
// A zip for a release page is loaded unpacked and carries the key; a Web Store build has none.
const layout = zipLayout(config.packageName, manifest);
writeZip(dist, join(root, layout.file), layout.folder);
console.log(`wrote ${layout.file}${layout.store ? " (Chrome Web Store: manifest.json at the top level)" : ` (one folder, ${layout.folder}/, for Load unpacked)`}`);
