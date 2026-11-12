// SPDX-License-Identifier: Apache-2.0
// The popup's "Keep the card I'm pointing at" switch as stored, and the hold it picks.
import { describe, expect, it } from "vitest";

import { sessionOptions, SESSION_OPTIONS, storedSessionOptions } from "../src/compute/session-options.js";
import { applyStorageChanges } from "../src/content/storage-changes.js";
import { KEEP_CARD_KEY, keepCardChanged, keepCardOn, readKeepCard } from "../src/shared/keep-card.js";
import { READING_HOLD, SHOWN_HOLD } from "../vendor/cardvision-browser/compute-session.js";
import { memoryStorage } from "./helpers/memory-storage.js";

describe("keep the card I'm pointing at", () => {
  it("is on unless switched off", async () => {
    expect(await readKeepCard(memoryStorage())).toBe(true);
    for (const value of [true, null, "false", 0, {}]) expect(await readKeepCard(memoryStorage({ [KEEP_CARD_KEY]: value }))).toBe(true);
    expect(await readKeepCard(memoryStorage({ [KEEP_CARD_KEY]: false }))).toBe(false);
  });

  it("counts a change only when the switch turns over", () => {
    expect(keepCardChanged({ oldValue: true, newValue: false })).toBe(true);
    expect(keepCardChanged({ oldValue: false, newValue: true })).toBe(true);
    // The first press on a fresh install stores false over nothing: on to off.
    expect(keepCardChanged({ newValue: false })).toBe(true);
    // Nothing stored to true, or the same state written again, keeps the running frame.
    expect(keepCardChanged({ newValue: true })).toBe(false);
    expect(keepCardChanged({ oldValue: false, newValue: false })).toBe(false);
    expect(keepCardChanged(undefined)).toBe(false);
    // Cleared storage (no new value) is on again.
    expect(keepCardChanged({ oldValue: false })).toBe(true);
    expect(keepCardOn(undefined)).toBe(true);
  });

  it("picks the reading hold when on, and the shown hold when off, with the other options unchanged", () => {
    expect(sessionOptions(true).hold).toBe(READING_HOLD);
    expect(sessionOptions(false).hold).toBe(SHOWN_HOLD);
    expect(READING_HOLD.untilPointerLeaves).toBe(true);
    expect(SHOWN_HOLD.untilPointerLeaves).toBeFalsy();
    for (const on of [true, false]) {
      const { hold, ...rest } = sessionOptions(on);
      void hold;
      expect(rest).toEqual(SESSION_OPTIONS);
    }
    expect("hold" in SESSION_OPTIONS).toBe(false);
  });

  it("gives the compute frame the hold the stored switch picks, and the reading hold when the storage cannot be read", async () => {
    expect((await storedSessionOptions(memoryStorage())).hold).toBe(READING_HOLD);
    expect((await storedSessionOptions(memoryStorage({ [KEEP_CARD_KEY]: true }))).hold).toBe(READING_HOLD);
    expect((await storedSessionOptions(memoryStorage({ [KEEP_CARD_KEY]: false }))).hold).toBe(SHOWN_HOLD);
    const broken = { get: () => Promise.reject(new Error("no storage")) };
    expect((await storedSessionOptions(broken)).hold).toBe(READING_HOLD);
  });

  it("remakes the compute frame for a stored change that turns the switch over, and for nothing else", () => {
    const calls: string[] = [];
    const agent = {
      setEnabled: (on: boolean) => void calls.push(`enabled ${on}`),
      setCardSize: (percent: number) => void calls.push(`size ${percent}`),
      restartForKeepCard: () => void calls.push("restart"),
    };
    applyStorageChanges(agent, { [KEEP_CARD_KEY]: { oldValue: true, newValue: false } }, "local");
    expect(calls).toEqual(["restart"]);
    applyStorageChanges(agent, { [KEEP_CARD_KEY]: { oldValue: false, newValue: false } }, "local");
    applyStorageChanges(agent, { [KEEP_CARD_KEY]: { newValue: true } }, "local");
    applyStorageChanges(agent, { [KEEP_CARD_KEY]: { oldValue: true, newValue: false } }, "sync");
    expect(calls).toEqual(["restart"]);
    // The other settings, as before.
    applyStorageChanges(agent, { enabled: { newValue: false }, cardSize: { newValue: 120 } }, "local");
    expect(calls).toEqual(["restart", "enabled false", "size 120"]);
  });
});
