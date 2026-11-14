// SPDX-License-Identifier: Apache-2.0
// The vendored runtime must be exactly what the toolkit's vendor tool recorded in
// cardvision-vendor.json: every file listed, none changed, none added. The build,
// verify-remote-release.mjs and firefox-source-archive.mjs read the manifest through this file,
// and the build and verify-remote-release.mjs check the folder with it before any vendored code
// runs.
//
// The check is the toolkit's stand-alone checker, vendored with the runtime. It catches accidental
// edits (a hand fix, a merge that touched the folder). It is not a defense against someone who
// changes a file and its recorded SHA-256 together: the commit the manifest names is public, so
// that is checked by vendoring it again (`npm run vendor-check` in a toolkit checkout at that
// commit compares the folder with the commit's build).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST, checkVendor } from "../vendor/cardvision-browser/cardvision-vendor-check.mjs";

export const vendorDir = fileURLToPath(new URL("../vendor/cardvision-browser", import.meta.url));

/** What the build scripts need from the manifest: the toolkit version and commit, the ONNX Runtime
 *  pin and the files the worker loads, and the OpenCV and Emscripten versions of the OpenCV.js build. */
export function readVendorManifest(dir = vendorDir) {
  const m = JSON.parse(readFileSync(join(dir, MANIFEST), "utf-8"));
  return {
    version: m.toolkit.version,
    commit: m.toolkit.commit,
    onnxruntimeWeb: m.ort.version,
    ortFiles: m.ort.files,
    opencvTag: m.opencv?.tag ?? null,
    opencvEmsdk: m.opencv?.emsdk ?? null,
  };
}

/** The repository's own vendor folder: exit 1 with the problems, or return its manifest. */
export function checkVendoredRuntime() {
  const problems = checkVendor(vendorDir);
  if (problems.length > 0) {
    console.error(`vendor/cardvision-browser does not match ${MANIFEST}:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  return readVendorManifest();
}
