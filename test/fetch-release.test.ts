// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error: a plain .mjs build script, without declarations.
import { readReleasePin, releaseProblems } from "../scripts/fetch-release.mjs";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the bundled release pin", () => {
  it("is one full commit and one release.json hash, with the files the tests and the store build need", () => {
    const pin = readReleasePin();
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.releaseJsonSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pin.files).toEqual(expect.arrayContaining(["release.json", "SHA256SUMS", "detector.onnx", "recognizer.onnx"]));
  });
});

describe("the release folder checks", () => {
  let dir: string;
  const release = '{"id":"test"}';
  const pin = { releaseJsonSha256: sha(release) };
  const write = (name: string, text: string): void => writeFileSync(join(dir, name), text);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fetch-release-"));
    write("release.json", release);
    write("detector.onnx", "model");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes a folder whose files match release.json's pin and SHA256SUMS, text or binary mode, LF or CRLF", () => {
    write("SHA256SUMS", `${sha(release)}  release.json\r\n${sha("model")} *detector.onnx\n`);
    expect(releaseProblems(dir, pin)).toEqual([]);
  });

  it("names a release.json other than the pinned one", () => {
    write("SHA256SUMS", `${sha(release)}  release.json\n`);
    expect(releaseProblems(dir, { releaseJsonSha256: sha("other") })).toEqual(["release.json does not match the pinned SHA-256"]);
  });

  it("names a missing file, a file with other bytes and a line it cannot read", () => {
    write("SHA256SUMS", `${sha("model!")}  detector.onnx\n${sha("x")}  bank.json\nnot a line\n`);
    expect(releaseProblems(dir, pin)).toEqual([
      "detector.onnx does not match SHA256SUMS",
      "bank.json is missing",
      'SHA256SUMS: cannot read the line "not a line"',
    ]);
  });

  it("names a folder without release.json or SHA256SUMS", () => {
    expect(releaseProblems(dir, pin)).toEqual(["SHA256SUMS is missing"]);
    rmSync(join(dir, "release.json"));
    expect(releaseProblems(dir, pin)).toEqual(["release.json is missing"]);
  });
});
