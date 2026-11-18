// SPDX-License-Identifier: Apache-2.0
// A release pull request is judged on its own copy of a pinned file, and the tag's build and the
// upload wait for GitHub to serve that text after the merge.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it, vi } from "vitest";

// @ts-expect-error plain JavaScript build scripts
import { commitTimeMs, FETCH_TIMEOUT_MS, main, MAX_WAIT_MS, ownFile, POLL_MS, pullRequestProblems, SETTLE_MS, STEADY_POLLS, waitForOwnFiles } from "../scripts/before-addresses.mjs";

const hash = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");
const OWN = "https://raw.githubusercontent.com/ryangswe/kenbunshoku/main/";
const PRIVACY = `${OWN}PRIVACY.md`;
const CONFIG = "https://cdn.kenbunshoku.com/config.json";
const own = { url: PRIVACY, sha256: hash("new policy") };
const served = (text: string, status = 200) => new Response(text, { status });

// A clock that only moves when the code under test sleeps, long after the merge unless told otherwise.
function clock(start = 10 * MAX_WAIT_MS) {
  let time = start;
  return { now: () => time, sleep: vi.fn(async (ms: number) => void (time += ms)), mergedAt: () => 0, log: () => {} };
}
// Serves the old text until the given poll, counted from 1, and the new text from then on.
const newTextFrom = (poll: number) => {
  let polls = 0;
  return vi.fn(async () => served(++polls >= poll ? "new policy" : "old policy"));
};
const answers = (...texts: string[]) => {
  const fetchFn = vi.fn();
  for (const text of texts) fetchFn.mockResolvedValueOnce(served(text));
  return fetchFn;
};

// A copy of this repository without its history can still run the tests that need no commit.
const repo = fileURLToPath(new URL("..", import.meta.url));
const notCheckout = spawnSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd: repo }).status !== 0;

const folder = mkdtempSync(join(tmpdir(), "before-addresses-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
let files = 0;
function releaseFile(before: unknown[]) {
  const file = join(folder, `release-${++files}.json`);
  writeFileSync(file, JSON.stringify({ before }));
  return file;
}

describe("ownFile", () => {
  it("names a pinned file on this repository's main branch", () => {
    expect(ownFile(own)).toBe("PRIVACY.md");
  });

  it.each([
    ["no hash", { url: PRIVACY }],
    ["another host", { url: CONFIG, sha256: own.sha256 }],
    ["another repository", { url: "https://raw.githubusercontent.com/someone/else/main/PRIVACY.md", sha256: own.sha256 }],
    ["another branch", { url: "https://raw.githubusercontent.com/ryangswe/kenbunshoku/dev/PRIVACY.md", sha256: own.sha256 }],
    ["a query", { url: `${PRIVACY}?x=1`, sha256: own.sha256 }],
    ["a path out of the branch", { url: `${OWN}../dev/PRIVACY.md`, sha256: own.sha256 }],
    ["an encoded parent folder", { url: `${OWN}a%2F..%2F..%2Fsecret`, sha256: own.sha256 }],
  ])("leaves out %s", (_name, entry) => {
    expect(ownFile(entry)).toBeNull();
  });
});

describe("pullRequestProblems", () => {
  it("passes on the pull request's own copy without asking the live address", async () => {
    const fetchFn = vi.fn();
    expect(await pullRequestProblems({ before: [own] }, { readFile: () => "new policy", fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails when the pull request's copy is not the pinned text", async () => {
    const problems = await pullRequestProblems({ before: [own] }, { readFile: () => "old policy", fetchFn: vi.fn() });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("PRIVACY.md");
  });

  it("fails when the pull request has no such file", async () => {
    const readFile = () => {
      throw new Error("no such file");
    };
    expect(await pullRequestProblems({ before: [own] }, { readFile, fetchFn: vi.fn() })).toHaveLength(1);
  });

  it("still fails on any other address that is not live", async () => {
    const fetchFn = vi.fn().mockResolvedValue(served("gone", 404));
    const problems = await pullRequestProblems({ before: [{ url: CONFIG }] }, { readFile: vi.fn(), fetchFn });
    expect(problems).toEqual([`${CONFIG}: HTTP 404`]);
  });

  it("passes on another address that is live", async () => {
    const fetchFn = vi.fn().mockResolvedValue(served("{}"));
    expect(await pullRequestProblems({ before: [{ url: CONFIG }] }, { readFile: vi.fn(), fetchFn })).toEqual([]);
  });
});

describe("waitForOwnFiles", () => {
  it("keeps the limits the release steps describe", () => {
    expect({ FETCH_TIMEOUT_MS, MAX_WAIT_MS, POLL_MS, SETTLE_MS, STEADY_POLLS }).toEqual({
      FETCH_TIMEOUT_MS: 15_000,
      MAX_WAIT_MS: 600_000,
      POLL_MS: 10_000,
      SETTLE_MS: 330_000,
      STEADY_POLLS: 3,
    });
  });

  it("gives every request a time limit", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchFn = vi.fn(async (_url: string, _options: { signal?: AbortSignal }) => served("new policy"));
    await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn });
    expect(fetchFn.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(FETCH_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it.skipIf(notCheckout)("waits from the commit's own time unless told otherwise", async () => {
    const time = clock(commitTimeMs() + 100_000);
    await waitForOwnFiles({ before: [own] }, { now: time.now, sleep: time.sleep, log: time.log, fetchFn: vi.fn(async () => served("new policy")) });
    expect(time.sleep.mock.calls[0]).toEqual([SETTLE_MS - 100_000]);
  });

  it.skipIf(notCheckout)("takes the merge time from the commit under test", () => {
    const seconds = execFileSync("git", ["log", "-1", "--format=%ct", "HEAD"], { cwd: repo, encoding: "utf-8" }).trim();
    expect(commitTimeMs()).toBe(Number(seconds) * 1000);
  });

  it("waits no longer than the cache lasts when the commit's time is in the future", async () => {
    const time = clock();
    const start = time.now();
    const asked: number[] = [];
    const fetchFn = vi.fn(async () => {
      asked.push(time.now());
      return served("new policy");
    });
    await waitForOwnFiles({ before: [own] }, { ...time, mergedAt: () => start + 3_600_000, fetchFn });
    expect(asked[0]).toBe(start + SETTLE_MS);
  });

  it("counts the cache's wait inside the deadline", async () => {
    const time = clock();
    const start = time.now();
    const fetchFn = vi.fn(async () => served("old policy"));
    expect(await waitForOwnFiles({ before: [own] }, { ...time, mergedAt: () => start, fetchFn })).toHaveLength(1);
    expect(time.now() - start).toBeLessThanOrEqual(MAX_WAIT_MS);
  });

  it("asks nothing until GitHub's cache from before the merge has expired", async () => {
    const time = clock();
    const merged = time.now() - 60_000;
    const asked: number[] = [];
    const fetchFn = vi.fn(async () => {
      asked.push(time.now());
      return served("new policy");
    });
    expect(await waitForOwnFiles({ before: [own] }, { ...time, mergedAt: () => merged, fetchFn })).toEqual([]);
    expect(asked[0]).toBe(merged + SETTLE_MS);
  });

  it("does not hold up a run long after the merge", async () => {
    const time = clock();
    const fetchFn = vi.fn(async () => served("new policy"));
    expect(await waitForOwnFiles({ before: [own] }, { ...time, fetchFn })).toEqual([]);
    expect(time.sleep.mock.calls).toEqual([[POLL_MS], [POLL_MS]]);
  });

  it("starts counting again when a cache answers with the old text", async () => {
    const fetchFn = answers("new policy", "new policy", "old policy", "new policy", "new policy", "new policy");
    expect(await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn })).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("keeps waiting through a network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error("reset"));
    for (let i = 0; i < STEADY_POLLS; i++) fetchFn.mockResolvedValueOnce(served("new policy"));
    expect(await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn })).toEqual([]);
  });

  it("passes when the text arrives in time for the last three polls", async () => {
    expect(await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn: newTextFrom(58) })).toEqual([]);
  });

  it("fails when the text arrives too late to be served steadily", async () => {
    const fetchFn = newTextFrom(59);
    expect(await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn })).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(60);
  });

  it("says what was served when it gives up", async () => {
    const fetchFn = vi.fn(async () => served("old policy"));
    const [problem] = await waitForOwnFiles({ before: [own] }, { ...clock(), fetchFn });
    expect(problem).toContain(hash("old policy"));
  });

  it("keeps one deadline for every file", async () => {
    const time = clock();
    const start = time.now();
    const fetchFn = vi.fn(async () => served("old policy"));
    const other = { url: `${OWN}TERMS.md`, sha256: own.sha256 };
    expect(await waitForOwnFiles({ before: [own, other] }, { ...time, fetchFn })).toHaveLength(2);
    expect(time.now() - start).toBeLessThanOrEqual(MAX_WAIT_MS);
  });

  it("does not wait for any other address", async () => {
    const time = clock();
    const fetchFn = vi.fn();
    const mergedAt = vi.fn();
    expect(await waitForOwnFiles({ before: [{ url: CONFIG }] }, { ...time, mergedAt, fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mergedAt).not.toHaveBeenCalled();
    expect(time.sleep).not.toHaveBeenCalled();
  });
});

describe("main", () => {
  it("waits in `wait` mode and fails when the text never arrives", async () => {
    const file = releaseFile([own]);
    expect(await main(["wait", file], { ...clock(), fetchFn: vi.fn(async () => served("old policy")) })).toBe(1);
    expect(await main(["wait", file], { ...clock(), fetchFn: vi.fn(async () => served("new policy")) })).toBe(0);
  });

  it("reads the commit in `pull-request` mode", async () => {
    const file = releaseFile([own]);
    expect(await main(["pull-request", file], { readFile: () => "old policy", log: () => {} })).toBe(1);
    expect(await main(["pull-request", file], { readFile: () => "new policy", log: () => {} })).toBe(0);
  });

  it("refuses an unknown mode", async () => {
    expect(await main(["later", "file.json"], { log: () => {} })).toBe(2);
  });
});

describe("the script as the workflows run it", () => {
  const script = fileURLToPath(new URL("../scripts/before-addresses.mjs", import.meta.url));
  const run = (before: unknown[]) => spawnSync(process.execPath, [script, "pull-request", releaseFile(before)], { encoding: "utf-8" });

  it.skipIf(notCheckout)("exits 0 on the committed text", () => {
    const committed = execFileSync("git", ["show", "HEAD:PRIVACY.md"], { cwd: repo });
    expect(run([{ url: PRIVACY, sha256: hash(committed) }]).status).toBe(0);
  });

  it("exits 1 and names the file on any other text", () => {
    const result = run([{ url: PRIVACY, sha256: hash("not the policy") }]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::before upload: PRIVACY.md");
  });

  it("exits 1 on a folder, whose listing is not a file that can go live", () => {
    const listing = notCheckout ? "" : execFileSync("git", ["show", "HEAD:store"], { cwd: repo });
    expect(run([{ url: `${OWN}store`, sha256: hash(listing) }]).status).toBe(1);
  });

  it("exits 1 on a file that is on disk but was never committed", () => {
    const ignored = readFileSync(join(repo, "node_modules", ".package-lock.json"));
    expect(run([{ url: `${OWN}node_modules/.package-lock.json`, sha256: hash(ignored) }]).status).toBe(1);
  });
});

describe("the store workflows", () => {
  const workflow = (name: string) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf-8");
  const release = 'store/releases/${TAG#"$TAG_PREFIX"}.json';
  const waitStep = `      - name: Wait for the merged text of the pinned files\n        run: node scripts/before-addresses.mjs wait "${release}"\n`;

  it("judge a release pull request on its own copy", () => {
    const text = workflow("store-check.yml");
    expect(text).toContain("BEFORE_ON_PULL_REQUEST: warn # PRODUCT");
    expect(text).toContain(
      `      - name: Check the release's before addresses\n        if: env.STORE_CHECK_MODE == 'release'\n        run: node scripts/before-addresses.mjs pull-request "${release}"\n`,
    );
    expect(text).not.toContain("continue-on-error");
  });

  it("wait for the merged text before the tag's build and the upload check it", () => {
    const text = workflow("store-release.yml");
    const waits = [...text.matchAll(new RegExp(waitStep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map((m) => m.index);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeLessThan(text.indexOf("- name: Check the release\n"));
    expect(waits[1]).toBeGreaterThan(text.indexOf("name: Upload (after approval)"));
    expect(waits[1]).toBeLessThan(text.indexOf("- id: google"));
    expect(text).not.toContain("continue-on-error");
  });
});
