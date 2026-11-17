// SPDX-License-Identifier: Apache-2.0
// The popup's "New version available" line: the toolkit's version rules (vendored
// host-settings.js) on this extension's notices.
import { describe, expect, it } from "vitest";

import { compareVersions, DISMISSED_UPDATE_KEY, updateNotice } from "../vendor/cardvision-browser/host-settings.js";

describe("compareVersions", () => {
  it.each([
    ["0.1.0", "0.2.0", -1],
    ["0.10.0", "0.9.9", 1],
    ["1.0.0", "1.0.0", 0],
    ["1.0", "1.0.0", 0],
    ["1.0.0.1", "1.0.0", 1],
  ])("%s vs %s", (a, b, d) => expect(compareVersions(a, b)).toBe(d));
});

describe("updateNotice", () => {
  it("keeps the key this extension has always stored a dismissal under", () => expect(DISMISSED_UPDATE_KEY).toBe("update.dismissed"));
  const update = { latest: "0.2.0", url: "https://github.com/ryangswe/kenbunshoku/releases" };
  it("shows nothing without the field", () => expect(updateNotice(null, "0.1.0", null)).toBeNull());
  it("shows the line when the running version is lower", () => expect(updateNotice(update, "0.1.0", null)).toEqual(update));
  it("shows nothing when the running version is the same or newer", () => {
    expect(updateNotice(update, "0.2.0", null)).toBeNull();
    expect(updateNotice(update, "0.3.0", null)).toBeNull();
  });
  it("shows nothing once dismissed for that version, and again for a newer one", () => {
    expect(updateNotice(update, "0.1.0", "0.2.0")).toBeNull();
    expect(updateNotice({ ...update, latest: "0.3.0" }, "0.1.0", "0.2.0")).not.toBeNull();
  });
});
