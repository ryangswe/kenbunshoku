// SPDX-License-Identifier: Apache-2.0
// The popup's two switches as stored, read through the toolkit's hover host (vendored
// host-settings.js, createSwitches): "Card hovers" (`enabled`) and "Keep the card I'm pointing at"
// (`keepCard`). Both are on unless switched off. The compute frame reads keep-card when it starts
// (the reading hold when on, the shown hold when off), and the host makes a running compute frame
// again only when it turns over (S-H3).
import { describe, expect, it } from "vitest";

import { createSwitches, ENABLED_KEY, KEEP_CARD_KEY, type StorageChange } from "../vendor/cardvision-browser/host-settings.js";
import { memoryStorage } from "./helpers/memory-storage.js";

type Listener = (changes: Record<string, StorageChange | undefined>, area: string) => void;

function changeEvents() {
  const listeners = new Set<Listener>();
  return {
    addListener: (fn: Listener) => void listeners.add(fn),
    removeListener: (fn: Listener) => void listeners.delete(fn),
    fire: (changes: Record<string, StorageChange | undefined>, area = "local") => {
      for (const fn of [...listeners]) fn(changes, area);
    },
    get count() {
      return listeners.size;
    },
  };
}

describe("the popup's switches", () => {
  it("keep the keys this extension has always stored", () => {
    expect([ENABLED_KEY, KEEP_CARD_KEY]).toEqual(["enabled", "keepCard"]);
  });

  it("are on unless switched off", async () => {
    const read = (stored: Record<string, unknown>) => createSwitches(memoryStorage(stored), changeEvents());
    expect(await read({}).keepCard()).toBe(true);
    expect(await read({}).enabled()).toBe(true);
    for (const value of [true, null, "false", 0, {}]) {
      expect(await read({ [KEEP_CARD_KEY]: value }).keepCard()).toBe(true);
      expect(await read({ [ENABLED_KEY]: value }).enabled()).toBe(true);
    }
    expect(await read({ [KEEP_CARD_KEY]: false }).keepCard()).toBe(false);
    expect(await read({ [ENABLED_KEY]: false }).enabled()).toBe(false);
  });

  it("read as on when the storage cannot be read (the compute frame then takes the reading hold)", async () => {
    const broken = { get: () => Promise.reject(new Error("no storage")) };
    const switches = createSwitches(broken, changeEvents());
    expect(await switches.keepCard()).toBe(true);
    expect(await switches.enabled()).toBe(true);
  });

  it("count a change only when the switch turns over", () => {
    const events = changeEvents();
    const flips: string[] = [];
    const stop = createSwitches(memoryStorage(), events).watch({ keepCard: (on) => void flips.push(`keepCard ${on}`), enabled: (on) => void flips.push(`enabled ${on}`) });
    events.fire({ [KEEP_CARD_KEY]: { oldValue: true, newValue: false } });
    events.fire({ [KEEP_CARD_KEY]: { oldValue: false, newValue: true } });
    // The first press on a fresh install stores false over nothing: on to off.
    events.fire({ [KEEP_CARD_KEY]: { newValue: false } });
    expect(flips).toEqual(["keepCard false", "keepCard true", "keepCard false"]);
    // Nothing stored to true, or the same state written again, keeps the running frame.
    events.fire({ [KEEP_CARD_KEY]: { newValue: true } });
    events.fire({ [KEEP_CARD_KEY]: { oldValue: false, newValue: false } });
    events.fire({ [KEEP_CARD_KEY]: undefined });
    // Another storage area is not the popup's.
    events.fire({ [KEEP_CARD_KEY]: { oldValue: true, newValue: false } }, "sync");
    expect(flips).toHaveLength(3);
    // Cleared storage (no new value) is on again.
    events.fire({ [KEEP_CARD_KEY]: { oldValue: false } });
    expect(flips.at(-1)).toBe("keepCard true");
    // The main switch follows the same rule.
    events.fire({ [ENABLED_KEY]: { newValue: false } });
    events.fire({ [ENABLED_KEY]: { newValue: true } });
    expect(flips.slice(4)).toEqual(["enabled false"]);
    stop();
    expect(events.count).toBe(0);
  });

  it("let a change made while a read is pending stand over the read's answer (S-H1)", async () => {
    const events = changeEvents();
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    const slow = { get: () => new Promise<Record<string, unknown>>((resolve) => (answer = resolve)) };
    const read = createSwitches(slow, events).enabled();
    events.fire({ [ENABLED_KEY]: { oldValue: true, newValue: false } });
    answer({ [ENABLED_KEY]: true });
    expect(await read).toBe(false);
    expect(events.count).toBe(0);
  });
});
