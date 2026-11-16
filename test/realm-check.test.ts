// SPDX-License-Identifier: Apache-2.0
// The build's realm check: the vendored toolkit check passes a folder whose files hold each runtime
// module at most once, and fails one where a file holds a module twice or nothing can be checked.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error plain JavaScript build scripts
import { REALM_CHECK, realmCheck } from "../scripts/realm-check.mjs";

// The text of each realm mark, read from the vendored check so the test follows the toolkit.
const MARKS = [...readFileSync(REALM_CHECK, "utf-8").matchAll(/mark\("[^"]+", "[^"]+", "([A-Za-z0-9+/=]+)"\)/g)].map((m) =>
  atob(m[1] ?? ""),
);

const dirs: string[] = [];
function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "realm-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("realmCheck", () => {
  it("reads the marks from the vendored check", () => {
    expect(MARKS.length).toBeGreaterThan(0);
  });

  it("passes files that hold each mark once, in as many files as need it", () => {
    const one = `var a = ${JSON.stringify(MARKS[0])};`;
    const result = realmCheck(folder({ "content.js": one, "popup.js": one, "other.js": "var b = 1;" }));
    expect(result).toEqual({ ok: true, message: expect.stringMatching(/^realm check: 3 files/) });
  });

  it("fails a file that holds a mark twice", () => {
    const twice = `var a = ${JSON.stringify(MARKS[0])}; var b = ${JSON.stringify(MARKS[0])};`;
    const result = realmCheck(folder({ "content.js": twice }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/content\.js: the realm mark .* occurs 2 times/);
  });

  it("reads files in subfolders, as the build's runtime/ folder", () => {
    const twice = `var a = ${JSON.stringify(MARKS[0])}; var b = ${JSON.stringify(MARKS[0])};`;
    const result = realmCheck(folder({ "content.js": "var b = 1;", "runtime/worker.mjs": twice }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/runtime\/worker\.mjs: the realm mark .* occurs 2 times/);
  });

  it("fails a folder with nothing to check", () => {
    const result = realmCheck(folder({ "notes.txt": "no scripts here" }));
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/nothing was read/) });
  });
});
