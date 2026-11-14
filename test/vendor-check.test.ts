// SPDX-License-Identifier: Apache-2.0
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error: a plain .mjs build script, without declarations.
import { readVendorManifest, vendorDir } from "../scripts/vendor-check.mjs";
// @ts-expect-error: the toolkit's stand-alone checker, a plain .mjs file without declarations.
import { checkVendor } from "../vendor/cardvision-browser/cardvision-vendor-check.mjs";

describe("the vendored runtime check", () => {
  it("finds the repository's own vendored runtime as its manifest records it", () => {
    expect(checkVendor(vendorDir)).toEqual([]);
  });

  it("reads the toolkit commit and the ONNX Runtime pin the build uses", () => {
    const vendor = readVendorManifest();
    expect(vendor.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(vendor.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(vendor.ortFiles).toEqual(["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]);
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf-8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["onnxruntime-web"]).toBe(vendor.onnxruntimeWeb);
  });

  describe("on a copy of the folder", () => {
    let dir: string;
    beforeEach(() => {
      dir = join(mkdtempSync(join(tmpdir(), "vendor-check-")), "cardvision-browser");
      cpSync(vendorDir, dir, { recursive: true });
    });
    afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

    it("names a changed file", () => {
      appendFileSync(join(dir, "worker.js"), "\n// edited");
      const problems = checkVendor(dir) as string[];
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join("\n")).toContain("worker.js");
    });

    it("names a file the manifest does not list", () => {
      writeFileSync(join(dir, "extra.js"), "extra");
      expect((checkVendor(dir) as string[]).join("\n")).toContain("extra.js");
    });
  });
});
