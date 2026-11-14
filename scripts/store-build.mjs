// SPDX-License-Identifier: Apache-2.0
// Build the two store packages and the Firefox source archive from this commit, for the store
// release workflow (.github/workflows/store-release.yml) and its pull request check
// (.github/workflows/store-check.yml):
//
//   out/chrome.zip           the Chrome Web Store package (npm run build -- --store)
//   out/firefox.zip          the addons.mozilla.org package (npm run build -- --target firefox)
//   out/firefox-source.zip   the source archive Mozilla's reviewers ask for (never publish it)
//
//   npm run store:build [-- --release <folder>] [--runtime-repo <toolkit checkout>]
//
// Before building, it checks that cdn/RUNTIMES.json has a row for this version that names the
// vendored toolkit commit, the ONNX Runtime Web version and the bundled release. After building,
// it unpacks the source archive, runs its build-firefox.sh and checks that the package it makes
// holds the same files, byte for byte, as out/firefox.zip.
//
// Without --release it downloads the pinned release (scripts/fetch-release.mjs) into
// out/release. Without --runtime-repo it clones the toolkit into out/toolkit, for the source
// archive. It uploads nothing.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { fetchRelease } from "./fetch-release.mjs";
import { loadForkConfig } from "./fork-config.mjs";
import { readVendorManifest } from "./vendor-check.mjs";

const TOOLKIT_REPO = "https://github.com/ryangswe/riftsight-vision";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "out");
const { values } = parseArgs({
  options: {
    release: { type: "string" },
    "runtime-repo": { type: "string" },
  },
});

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const capture = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf-8", maxBuffer: 1 << 30 });
const fail = (message) => {
  console.error(`store:build: ${message}`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const version = pkg.version;
const config = loadForkConfig();
const vendor = readVendorManifest();

mkdirSync(out, { recursive: true });

// 1. The release.
let releaseDir;
if (values.release) {
  releaseDir = resolve(values.release);
} else {
  try {
    releaseDir = (await fetchRelease(join(out, "release"))).dir;
  } catch (error) {
    fail(error.message);
  }
}
const release = JSON.parse(readFileSync(join(releaseDir, "release.json"), "utf-8"));

// 2. The RUNTIMES row for this version.
const runtimes = JSON.parse(readFileSync(join(root, "cdn", "RUNTIMES.json"), "utf-8"));
const row = runtimes[version];
if (!row) fail(`cdn/RUNTIMES.json has no row for ${version}; add one with each store release (cdn/SETTINGS.md)`);
const rowProblems = [];
const expect = (what, got, want) => {
  if (got !== want) rowProblems.push(`${what} is ${JSON.stringify(got)}, but ${JSON.stringify(want)} is what ships`);
};
expect("vendoredCommit", row.vendoredCommit, vendor.commit);
expect("ortWeb", row.ortWeb, pkg.dependencies?.["onnxruntime-web"]);
expect("bundledRelease.id", row.bundledRelease?.id, release.id);
expect("bundledRelease.detectorSha256", row.bundledRelease?.detectorSha256, release.detector?.sha256);
expect("bundledRelease.recognizerSha256", row.bundledRelease?.recognizerSha256, release.recognizer?.sha256);
if (rowProblems.length > 0) fail(`cdn/RUNTIMES.json's row for ${version}:\n  ${rowProblems.join("\n  ")}`);
console.log(`cdn/RUNTIMES.json: the ${version} row matches the vendored runtime and release ${release.id}`);

// 3. The two packages. Each build writes dist/, and npm run package zips it at the top level.
const packageOnce = (buildArgs, zipName, dest) => {
  run(process.execPath, ["scripts/build.mjs", "--release", releaseDir, ...buildArgs]);
  run(process.execPath, ["scripts/package.mjs"]);
  rmSync(dest, { force: true });
  renameSync(join(root, zipName), dest);
};
packageOnce(["--store"], `${config.packageName}-${version}-store.zip`, join(out, "chrome.zip"));
packageOnce(["--target", "firefox"], `${config.packageName}-${version}-firefox.zip`, join(out, "firefox.zip"));

// 4. The source archive, from the toolkit's history at the vendored commit.
let runtimeRepo;
if (values["runtime-repo"]) {
  runtimeRepo = resolve(values["runtime-repo"]);
} else {
  runtimeRepo = join(out, "toolkit");
  if (!existsSync(join(runtimeRepo, ".git")) && !existsSync(join(runtimeRepo, "HEAD"))) {
    rmSync(runtimeRepo, { recursive: true, force: true });
    run("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", TOOLKIT_REPO, runtimeRepo]);
  }
  try {
    capture("git", ["-C", runtimeRepo, "cat-file", "-e", `${vendor.commit}^{commit}`]);
  } catch {
    run("git", ["-C", runtimeRepo, "fetch", "--quiet", "origin", vendor.commit]);
  }
}
const sourceZip = join(out, "firefox-source.zip");
rmSync(sourceZip, { force: true });
run(process.execPath, ["scripts/firefox-source-archive.mjs", "--release", releaseDir, "--runtime-repo", runtimeRepo, "--out", sourceZip]);

// 5. The round trip: the archive's own build-firefox.sh must make the same files.
const check = join(out, "source-check");
rmSync(check, { recursive: true, force: true });
mkdirSync(check);
run("unzip", ["-q", sourceZip, "-d", check]);
run("./build-firefox.sh", [], check);
const rebuilt = join(check, "out", `${config.packageName}-${version}-firefox.zip`);
if (!existsSync(rebuilt)) fail(`the source archive's build-firefox.sh wrote no out/${config.packageName}-${version}-firefox.zip`);

/** Every file in a zip, by path, with its SHA-256 (folders left out). */
const zipFiles = (zip) => {
  const files = new Map();
  for (const name of capture("unzip", ["-Z1", zip]).split("\n")) {
    if (!name || name.endsWith("/")) continue;
    const bytes = execFileSync("unzip", ["-p", zip, name], { maxBuffer: 1 << 30 });
    files.set(name, createHash("sha256").update(bytes).digest("hex"));
  }
  return files;
};
const a = zipFiles(join(out, "firefox.zip"));
const b = zipFiles(rebuilt);
const differences = [];
for (const [name, hash] of a) {
  if (!b.has(name)) differences.push(`${name}: not in the rebuilt package`);
  else if (b.get(name) !== hash) differences.push(`${name}: different bytes`);
}
for (const name of b.keys()) if (!a.has(name)) differences.push(`${name}: only in the rebuilt package`);
if (differences.length > 0) fail(`the source archive does not rebuild out/firefox.zip:\n  ${differences.join("\n  ")}`);
console.log(`the source archive rebuilds out/firefox.zip: the same ${a.size} files, byte for byte`);
rmSync(check, { recursive: true, force: true });

console.log(`wrote out/chrome.zip, out/firefox.zip and out/firefox-source.zip for ${version}`);
