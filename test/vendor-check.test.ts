// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error: a plain .mjs build script, without declarations.
import { vendoredFiles, vendorProblems } from "../scripts/vendor-check.mjs";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the vendored runtime check", () => {
  let dir: string;
  let recorded: Record<string, string>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vendor-check-"));
    mkdirSync(join(dir, "types"));
    writeFileSync(join(dir, "worker.js"), "worker");
    writeFileSync(join(dir, "types", "index.d.ts"), "types");
    writeFileSync(join(dir, "VENDOR.json"), "{}");
    writeFileSync(join(dir, ".DS_Store"), "finder");
    recorded = { "types/index.d.ts": sha("types"), "worker.js": sha("worker") };
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lists every file but VENDOR.json and hidden ones, with forward slashes", () => {
    expect(vendoredFiles(dir)).toEqual(["types/index.d.ts", "worker.js"]);
  });

  it("finds nothing wrong with the folder as recorded", () => {
    expect(vendorProblems(dir, recorded)).toEqual([]);
  });

  it("names a changed file", () => {
    writeFileSync(join(dir, "worker.js"), `${readFileSync(join(dir, "worker.js"), "utf-8")}\n// edited`);
    expect(vendorProblems(dir, recorded)).toEqual(["worker.js differs from its recorded SHA-256"]);
  });

  it("names a missing file and one that is not listed", () => {
    rmSync(join(dir, "worker.js"));
    writeFileSync(join(dir, "types", "extra.d.ts"), "extra");
    expect(vendorProblems(dir, recorded)).toEqual(["types/extra.d.ts is not in VENDOR.json", "worker.js is missing"]);
  });

  it("refuses a VENDOR.json without hashes", () => {
    expect(vendorProblems(dir, undefined)).toHaveLength(1);
    expect(vendorProblems(dir, {})).toHaveLength(1);
  });

  it("checks the repository's own vendored runtime clean", () => {
    const own = join(import.meta.dirname, "..", "vendor", "cardvision-browser");
    const vendor = JSON.parse(readFileSync(join(own, "VENDOR.json"), "utf-8")) as { sha256: Record<string, string> };
    expect(vendorProblems(own, vendor.sha256)).toEqual([]);
  });
});
