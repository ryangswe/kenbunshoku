// SPDX-License-Identifier: Apache-2.0
// The settings publish script's checks: which fields change, where the update notice points, and
// when its GitHub release is not ready for zip installs.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// @ts-expect-error plain JavaScript build scripts
import { changedFields, noticeRelease, releaseProblems } from "../scripts/publish-settings.mjs";

const config = JSON.parse(readFileSync(new URL("../cdn/config.json", import.meta.url), "utf-8")) as Record<string, unknown>;

describe("changedFields", () => {
  it("names the top-level fields that differ", () => {
    const live = { ...config, update: { latest: "0.6.1", url: "https://github.com/ryangswe/kenbunshoku/releases/tag/v0.6.1" } };
    expect(changedFields(live, config)).toEqual(["update"]);
  });

  it("names a field that only one side has", () => {
    expect(changedFields({ a: 1 }, { a: 1, b: 2 })).toEqual(["b"]);
  });

  it("is empty for the same content", () => {
    expect(changedFields(config, JSON.parse(JSON.stringify(config)))).toEqual([]);
  });
});

describe("noticeRelease", () => {
  it("reads the repository, tag and zip from this repository's settings file", () => {
    const want = noticeRelease(config, "kenbunshoku");
    const latest = (config.update as { latest: string }).latest;
    expect(want).toEqual({ repo: "ryangswe/kenbunshoku", tag: `v${latest}`, zip: `kenbunshoku-${latest}.zip` });
  });

  it("is null without a notice, or for an address that is not a GitHub release", () => {
    expect(noticeRelease({}, "kenbunshoku")).toBeNull();
    expect(noticeRelease({ update: { latest: "1.0.0", url: "https://example.org/v1.0.0" } }, "kenbunshoku")).toBeNull();
  });
});

describe("releaseProblems", () => {
  const want = { repo: "ryangswe/kenbunshoku", tag: "v1.0.0", zip: "kenbunshoku-1.0.0.zip" };

  it("passes a published release that has the zip", () => {
    expect(releaseProblems(200, { draft: false, assets: [{ name: "SHA256SUMS" }, { name: "kenbunshoku-1.0.0.zip" }] }, want)).toEqual([]);
  });

  it("stops for a release that does not exist yet", () => {
    expect(releaseProblems(404, null, want)[0]).toMatch(/no GitHub release for v1\.0\.0/);
  });

  it("stops for a draft, and for a release whose zip is not attached yet", () => {
    const found = releaseProblems(200, { draft: true, assets: [{ name: "SHA256SUMS" }] }, want);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/draft/);
    expect(found[1]).toMatch(/no kenbunshoku-1\.0\.0\.zip/);
  });

  it("stops when the API cannot be read", () => {
    expect(releaseProblems(403, null, want)[0]).toMatch(/answered 403/);
  });
});
