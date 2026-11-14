// SPDX-License-Identifier: Apache-2.0
// Download the model release the extension bundles, as pinned in scripts/bundled-release.json, and
// check it: release.json against the pinned SHA-256, then every file against SHA256SUMS. The tests
// workflow and the store build (scripts/store-build.mjs) both use it, so the pin lives in one place.
//
//   node scripts/fetch-release.mjs --out <folder>
//
// A folder that already passes every check is kept as it is, so a second run downloads nothing;
// otherwise all the files are downloaded again. Each download gives up after two minutes, and is
// tried three times.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The pin, from scripts/bundled-release.json. */
export function readReleasePin() {
  const pin = JSON.parse(readFileSync(join(root, "scripts", "bundled-release.json"), "utf-8"));
  for (const key of ["repo", "commit", "releaseJsonSha256"]) {
    if (typeof pin[key] !== "string" || !pin[key]) throw new Error(`scripts/bundled-release.json: ${key} is required`);
  }
  if (!/^[0-9a-f]{40}$/.test(pin.commit)) throw new Error("scripts/bundled-release.json: commit must be a full commit hash");
  if (!/^[0-9a-f]{64}$/.test(pin.releaseJsonSha256)) throw new Error("scripts/bundled-release.json: releaseJsonSha256 must be 64 hex digits");
  if (!Array.isArray(pin.files) || !pin.files.includes("release.json") || !pin.files.includes("SHA256SUMS")) {
    throw new Error("scripts/bundled-release.json: files must list release.json and SHA256SUMS");
  }
  return pin;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Every problem with the folder's files: release.json's hash, then each SHA256SUMS line. */
export function releaseProblems(dir, pin) {
  const problems = [];
  const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name)) : null);
  const releaseJson = read("release.json");
  if (!releaseJson) return ["release.json is missing"];
  if (sha256(releaseJson) !== pin.releaseJsonSha256) problems.push("release.json does not match the pinned SHA-256");
  const sums = read("SHA256SUMS");
  if (!sums) return [...problems, "SHA256SUMS is missing"];
  for (const line of sums.toString("utf-8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (!m) {
      problems.push(`SHA256SUMS: cannot read the line "${line}"`);
      continue;
    }
    const bytes = read(m[2]);
    if (!bytes) problems.push(`${m[2]} is missing`);
    else if (sha256(bytes) !== m[1]) problems.push(`${m[2]} does not match SHA256SUMS`);
  }
  return problems;
}

/** Keep the folder if it passes every check; otherwise download every file, then check again. */
export async function fetchRelease(outDir) {
  const pin = readReleasePin();
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  if (releaseProblems(dir, pin).length === 0) return { dir, pin, downloaded: 0 };
  let downloaded = 0;
  for (const name of pin.files) {
    const url = `${pin.repo}/resolve/${pin.commit}/${name}`;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(join(dir, name), Buffer.from(await res.arrayBuffer()));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (lastError) throw new Error(`${url}: ${lastError.message}`);
    downloaded++;
  }
  const problems = releaseProblems(dir, pin);
  if (problems.length > 0) throw new Error(`the downloaded release fails its checks:\n  ${problems.join("\n  ")}`);
  return { dir, pin, downloaded };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  if (!values.out) {
    console.error("usage: node scripts/fetch-release.mjs --out <folder>");
    process.exit(2);
  }
  try {
    const { dir, pin, downloaded } = await fetchRelease(values.out);
    console.log(`release at ${pin.commit.slice(0, 12)} in ${dir} (${downloaded} files downloaded), checked against the pin and SHA256SUMS`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
