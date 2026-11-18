// SPDX-License-Identifier: Apache-2.0
// The "before upload" addresses of a release file, for the two moments the store tool cannot judge
// by reading the address once.
//
// `pull-request` runs in the store check. A file of this repository that the release pins by its
// SHA-256 goes live when the pull request merges, so the copy in the commit under test is compared
// with the hash. Any other address must already be live.
//
// `wait` runs before the tag's build and the upload check the live addresses. GitHub can serve the
// old text of a file for a few minutes after a merge, so this waits until the new text is served.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const OWN_FILES = "https://raw.githubusercontent.com/ryangswe/kenbunshoku/main/";

// GitHub's cache keeps a file for five minutes, so no copy from before the merge outlives this.
export const SETTLE_MS = 330_000;
export const MAX_WAIT_MS = 600_000;
export const POLL_MS = 10_000;
export const STEADY_POLLS = 3;
export const FETCH_TIMEOUT_MS = 15_000;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The committed file, because a build output or an ignored file on disk can never go live.
const committedFile = (path) => execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

export function commitTimeMs() {
  const seconds = Number(execFileSync("git", ["log", "-1", "--format=%ct", "HEAD"], { cwd: root, encoding: "utf-8" }).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("the commit under test has no readable time");
  return seconds * 1000;
}

/** The repository path of an entry this repository publishes by merging, or null for any other. */
export function ownFile(entry) {
  if (!entry.sha256) return null;
  const url = new URL(entry.url);
  if (!url.href.startsWith(OWN_FILES) || url.search || url.hash) return null;
  const path = decodeURIComponent(url.href.slice(OWN_FILES.length));
  if (path === "" || path.includes("\\") || path.split("/").some((part) => part === "" || part === "..")) return null;
  return path;
}

/** Why the address does not serve what the entry asks for, or null when it does. */
export async function liveProblem(entry, fetchFn = fetch) {
  try {
    const res = await fetchFn(entry.url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status !== 200) return `${entry.url}: HTTP ${res.status}`;
    if (!entry.sha256) return null;
    const got = sha256(new Uint8Array(await res.arrayBuffer()));
    return got === entry.sha256 ? null : `${entry.url}: serves sha256 ${got}, not ${entry.sha256}`;
  } catch (error) {
    return `${entry.url}: ${error.message}`;
  }
}

/** What a pull request must fix: its own copy of a pinned file, or another address not yet live. */
export async function pullRequestProblems(release, { readFile = committedFile, fetchFn = fetch } = {}) {
  const problems = [];
  for (const entry of release.before ?? []) {
    const path = ownFile(entry);
    if (path === null) {
      const problem = await liveProblem(entry, fetchFn);
      if (problem) problems.push(problem);
      continue;
    }
    let got;
    try {
      got = sha256(readFile(path));
    } catch (error) {
      problems.push(`${path}: cannot be read from the commit (${error.message})`);
      continue;
    }
    if (got !== entry.sha256) problems.push(`${path}: this pull request's copy has sha256 ${got}, and the release file pins ${entry.sha256}`);
  }
  return problems;
}

/**
 * Waits out GitHub's cache, then for each pinned file of this repository to be served steadily.
 * One deadline covers every file. Returns what was still wrong when it passed.
 */
export async function waitForOwnFiles(release, { fetchFn = fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), now = Date.now, mergedAt = commitTimeMs, log = console.log } = {}) {
  const entries = (release.before ?? []).filter((entry) => ownFile(entry) !== null);
  if (entries.length === 0) return [];
  const deadline = now() + MAX_WAIT_MS;
  const settle = Math.min(mergedAt() + SETTLE_MS - now(), SETTLE_MS);
  if (settle > 0) {
    log(`Waiting ${Math.ceil(settle / 1000)} s for GitHub's cache of the merged files to expire.`);
    await sleep(settle);
  }
  const problems = [];
  for (const entry of entries) {
    let steady = 0;
    let last = null;
    for (;;) {
      last = await liveProblem(entry, fetchFn);
      steady = last === null ? steady + 1 : 0;
      if (last !== null) log(`Waiting for the merged text: ${last}`);
      if (steady >= STEADY_POLLS || now() + POLL_MS >= deadline) break;
      await sleep(POLL_MS);
    }
    if (steady < STEADY_POLLS) problems.push(last ?? `${entry.url}: the merged text was not served steadily`);
  }
  return problems;
}

export async function main([mode, file], deps = {}) {
  const log = deps.log ?? console.log;
  if ((mode !== "pull-request" && mode !== "wait") || !file) {
    log("usage: node scripts/before-addresses.mjs pull-request|wait <release file>");
    return 2;
  }
  const release = JSON.parse(readFileSync(file, "utf-8"));
  const problems = mode === "wait" ? await waitForOwnFiles(release, deps) : await pullRequestProblems(release, deps);
  for (const problem of problems) log(`::error::before upload: ${problem}`);
  return problems.length === 0 ? 0 : 1;
}

// The real path, so that a link in the way cannot turn this check into a silent pass.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
