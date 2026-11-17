// SPDX-License-Identifier: Apache-2.0
// The content script's card-size wiring: the stored size at start, then each change in
// chrome.storage.local, reaches the tooltip adapter, and a real change fits the card on show again.

import { describe, expect, it, vi } from "vitest";
import { syncCardSize } from "../src/content/card-size-sync.js";

type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown } | undefined>, area: string) => void;

function setup(stored: Record<string, unknown>, getFails = false) {
  const sizes: number[] = [];
  let current = 1;
  const view = {
    setCardSize: (percent: number) => {
      sizes.push(percent);
      const scale = percent / 100;
      if (scale === current) return false;
      current = scale;
      return true;
    },
  };
  const host = { relayout: vi.fn() };
  const storage = { get: vi.fn(async () => (getFails ? Promise.reject(new Error("unreadable")) : stored)) };
  const listeners = new Set<Listener>();
  const changes = { addListener: (fn: Listener) => listeners.add(fn), removeListener: (fn: Listener) => listeners.delete(fn) };
  const stop = syncCardSize(view, host, storage, changes);
  const fire: Listener = (c, area) => { for (const fn of listeners) fn(c, area); };
  return { sizes, host, fire, stop, listeners };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("syncCardSize", () => {
  it("reads the stored size at start and fits the card on show again", async () => {
    const t = setup({ cardSize: 120 });
    await settle();
    expect(t.sizes).toEqual([120]);
    expect(t.host.relayout).toHaveBeenCalledTimes(1);
  });

  it("does not relayout when the stored size is the default the view already has", async () => {
    const t = setup({});
    await settle();
    expect(t.sizes).toEqual([100]);
    expect(t.host.relayout).not.toHaveBeenCalled();
  });

  it("follows a change in the local area, clamped to the dial", async () => {
    const t = setup({});
    await settle();
    t.fire({ cardSize: { oldValue: 100, newValue: 124 } }, "local");
    expect(t.sizes.at(-1)).toBe(120);
    t.fire({ cardSize: { oldValue: 120, newValue: 500 } }, "local");
    expect(t.sizes.at(-1)).toBe(130);
    expect(t.host.relayout).toHaveBeenCalledTimes(2);
  });

  it("ignores other areas and other keys", async () => {
    const t = setup({});
    await settle();
    t.fire({ cardSize: { newValue: 120 } }, "sync");
    t.fire({ cardLanguage: { newValue: "fr" } }, "local");
    expect(t.sizes).toEqual([100]);
    expect(t.host.relayout).not.toHaveBeenCalled();
  });

  it("treats a removed size as the default", async () => {
    const t = setup({ cardSize: 120 });
    await settle();
    t.fire({ cardSize: { oldValue: 120 } }, "local");
    expect(t.sizes.at(-1)).toBe(100);
    expect(t.host.relayout).toHaveBeenCalledTimes(2);
  });

  it("keeps the default when storage cannot be read", async () => {
    const t = setup({}, true);
    await settle();
    expect(t.sizes).toEqual([]);
    expect(t.host.relayout).not.toHaveBeenCalled();
  });

  it("stops following changes when stopped", async () => {
    const t = setup({});
    await settle();
    t.stop();
    expect(t.listeners.size).toBe(0);
  });
});
