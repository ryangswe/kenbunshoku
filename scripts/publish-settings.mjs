// SPDX-License-Identifier: Apache-2.0
// Publish the settings file (cdn/config.json) to the CDN in one command, for the maintainer:
//
//   npm run publish:settings              check, show the change, ask, publish and verify
//   npm run publish:settings -- --check   stop before anything reads the CDN credentials (it
//                                         still brings main up to date, step 1)
//
// In order, it:
//   1. brings this checkout up to date with origin/main (a fast-forward only), and stops when
//      cdn/config.json has local changes or the checkout is not on main;
//   2. reads the update notice in cdn/config.json and stops unless that version's GitHub release
//      exists and has its zip, so zip installs are never pointed at a page with no download;
//   3. compares the live settings file (settingsUrl in kenbunshoku.config.json) with
//      cdn/config.json, says which fields change, and stops when they are already the same;
//   4. runs `opcdn.py publish --dry-run` (it reads the live bucket and uploads nothing), asks
//      before publishing, then runs `opcdn.py publish` and `opcdn.py verify`;
//   5. reads the live file again and checks that it is cdn/config.json, byte for byte.
//
// The CDN credentials stay in cdn/.env, which only opcdn.py reads (cdn/README.md). This script
// never opens it. Installed extensions pick up the new file within about an hour.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const CONFIG = join(root, "cdn", "config.json");

/** The top-level fields whose values differ between two settings files, sorted. */
export function changedFields(live, local) {
  const keys = new Set([...Object.keys(live ?? {}), ...Object.keys(local ?? {})]);
  return [...keys].filter((k) => JSON.stringify(live?.[k]) !== JSON.stringify(local?.[k])).sort();
}

/**
 * Where the update notice points: the repository, the tag and the zip a release must carry, read
 * from `update.url` (https://github.com/<owner>/<repo>/releases/tag/<tag>). Null when there is no
 * notice or its address is not a GitHub release.
 */
export function noticeRelease(config, packageName) {
  const latest = config?.update?.latest;
  const url = config?.update?.url;
  if (typeof latest !== "string" || typeof url !== "string") return null;
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/tag\/([\w.+-]+)$/.exec(url);
  if (!m) return null;
  return { repo: m[1], tag: m[2], zip: `${packageName}-${latest}.zip` };
}

/** Problems with a GitHub release's API answer for the notice: none, or why it cannot be shown. */
export function releaseProblems(status, body, want) {
  if (status === 404) return [`${want.repo} has no GitHub release for ${want.tag} yet`];
  if (status !== 200) return [`the GitHub API answered ${status} for the release ${want.tag}`];
  const problems = [];
  if (body?.draft) problems.push(`the release ${want.tag} is still a draft`);
  const names = Array.isArray(body?.assets) ? body.assets.map((a) => a?.name) : [];
  if (!names.includes(want.zip)) problems.push(`the release ${want.tag} has no ${want.zip} yet (it is attached a few minutes after the release is made)`);
  return problems;
}

const say = (line = "") => console.log(line);
const stop = (message) => {
  console.error(`\npublish:settings: ${message}`);
  process.exit(1);
};
const git = (...args) => {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return stop(`git ${args[0]} failed: ${String(error.stderr ?? error.message).trim() || "no message"}`);
  }
};
/** A GET that stops with a plain message when the network or the server fails. */
const get = async (url, what, init = {}) => {
  try {
    return await fetch(url, init);
  } catch (error) {
    return stop(`could not reach ${what} (${error.cause?.code ?? error.message}); check the network and run this again`);
  }
};

async function main(argv) {
  const checkOnly = argv.includes("--check");

  // 1. Up to date with main.
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") stop(`this checkout is on ${branch}; switch to main first (git switch main)`);
  if (git("status", "--porcelain", "--", "cdn/config.json")) stop("cdn/config.json has local changes; publish only what is merged on main");
  git("fetch", "--quiet", "origin", "main");
  const behind = Number(git("rev-list", "--count", "HEAD..origin/main"));
  const ahead = Number(git("rev-list", "--count", "origin/main..HEAD"));
  if (ahead > 0) stop(`main has ${ahead} commit(s) that are not on GitHub; publish only what is merged`);
  if (behind > 0) {
    say(`Updating this checkout (${behind} commit(s) behind origin/main).`);
    git("merge", "--ff-only", "--quiet", "origin/main");
  }
  say(`main is at ${git("rev-parse", "--short", "HEAD")}, the same as GitHub.`);

  // 2. The update notice's release.
  const localText = readFileSync(CONFIG, "utf-8");
  const local = JSON.parse(localText);
  const product = JSON.parse(readFileSync(join(root, "kenbunshoku.config.json"), "utf-8"));
  const liveUrl = product.settingsUrl;
  const want = noticeRelease(local, product.packageName);
  if (want) {
    const res = await get(`https://api.github.com/repos/${want.repo}/releases/tags/${want.tag}`, "GitHub", {
      headers: { accept: "application/vnd.github+json" },
    });
    const problems = releaseProblems(res.status, res.ok ? await res.json() : null, want);
    if (res.status === 403 || res.status === 429) problems.push("GitHub limits how often it answers without signing in; wait an hour");
    if (problems.length > 0) stop(`${problems.join("; ")}. Wait for it, then run this again.`);
    say(`The update notice says ${local.update.latest} is out, and the ${want.tag} release has ${want.zip}.`);
  } else {
    say("cdn/config.json has no update notice that points at a GitHub release; not checking one.");
  }

  // 3. What changes.
  const liveRes = await get(`${liveUrl}?t=${Date.now()}`, "the CDN", { cache: "no-store" });
  if (!liveRes.ok) stop(`could not read the live settings file (${liveRes.status})`);
  const liveText = await liveRes.text();
  if (liveText === localText) {
    say("The live settings file is already cdn/config.json. Nothing to publish.");
    return;
  }
  let live = null;
  try {
    live = JSON.parse(liveText);
  } catch {
    say("The live settings file is not valid JSON; publishing replaces it.");
  }
  const fields = changedFields(live, local);
  say(`Publishing changes: ${fields.length > 0 ? fields.join(", ") : "only the file's formatting"}.`);
  if (checkOnly) {
    say("\nStopped before publishing (--check). Run npm run publish:settings to publish.");
    return;
  }

  // 4. Dry run, ask, publish, verify.
  const cdn = join(root, "cdn");
  const python = join(cdn, ".venv", "bin", "python");
  if (!existsSync(python)) stop("cdn/.venv is missing; set it up once as cdn/README.md says (Usage)");
  const opcdn = (...args) => spawnSync(python, ["opcdn.py", ...args], { cwd: cdn, stdio: "inherit" }).status;
  say("\nDry run (reads the live bucket, uploads nothing):");
  if (opcdn("publish", "--env-file", ".env", "--config", "config.json", "--dry-run") !== 0) stop("the dry run failed; nothing was published");
  if (!argv.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("\nPublish cdn/config.json to the CDN now? [y/N] ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") stop("not published");
  }
  if (opcdn("publish", "--env-file", ".env", "--config", "config.json") !== 0) stop("the publish failed; run this again to retry");
  say("\nChecking what is served:");
  if (opcdn("verify", "--env-file", ".env") !== 0) stop("the verify step failed; the file may be published but look wrong. Send the output above to whoever helps you");

  // 5. Read it back.
  const after = await get(`${liveUrl}?t=${Date.now()}`, "the CDN", { cache: "no-store" });
  if ((await after.text()) !== localText) stop("the live file is not cdn/config.json yet; wait a minute and run this again to check");
  say("\nDone. The live settings file is cdn/config.json. Installed extensions follow within about an hour.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
