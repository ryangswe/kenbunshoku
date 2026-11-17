// SPDX-License-Identifier: Apache-2.0
// The compute frame as compute.ts starts it: through the toolkit's hover host (vendored
// host-compute.js, startHostCompute) with this extension's config (src/shared/product.ts). The
// host's own tests hold the standard options; these are this extension's: the page is checked
// before anything is read, and its geometric stage loads at the viewer's first pointer, not with
// the release. The card facts' wiring is in test/compute-facts.test.ts.
import { afterEach, describe, expect, it } from "vitest";

import { buildLoadRequest } from "../src/compute/load-request.js";
import { tag } from "../src/shared/messages.js";
import { productConfig } from "../src/shared/product.js";
import { GEOMETRIC_OPTIONS, type HostCompute, startHostCompute } from "../vendor/cardvision-browser/host-compute.js";
import { PROTOCOL_VERSION } from "../vendor/cardvision-browser/compute-session.js";
import { SITE_ORIGIN } from "./helpers/fork.js";
import { FakeWorker, RID, statusOk } from "./helpers/remote-frame.js";

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

/** The compute frame's window, framed by `origin`, with the page's messages delivered to it. */
function frameWindow(origin: string | null) {
  const listeners: Array<(event: MessageEvent) => void> = [];
  const parent = { posted: [] as unknown[], postMessage(message: unknown) { this.posted.push(message); } };
  return {
    parent,
    win: {
      parent,
      location: { ancestorOrigins: origin === null ? [] : [origin] },
      addEventListener: (type: string, fn: (event: MessageEvent) => void) => {
        if (type === "message") listeners.push(fn);
      },
      removeEventListener: () => undefined,
    },
    /** A message from the embedding page. */
    fromPage(data: Record<string, unknown>) {
      for (const fn of listeners) fn({ data: tag(data), origin: origin ?? "null", source: parent } as unknown as MessageEvent);
    },
  };
}

const stops: HostCompute[] = [];
afterEach(() => {
  for (const host of stops.splice(0)) host.stop();
});

async function start(origin: string | null, request = buildLoadRequest("chrome-extension://x/release/release.json", "chrome-extension://x/runtime/", null)) {
  const page = frameWindow(origin);
  const workers: FakeWorker[] = [];
  const calls: string[] = [];
  const host = await startHostCompute({
    config: productConfig(false),
    win: page.win,
    storage: { get: async () => ({}) },
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    loadRequest: () => {
      calls.push("loadRequest");
      return request;
    },
    now: () => 0,
  });
  if (host) stops.push(host);
  return { host, page, workers, calls, posted: () => workers.flatMap((w) => w.posted) };
}

describe("the compute frame on the hover host", () => {
  it("starts only inside a page this build serves, and reads nothing for any other", async () => {
    const served = await start(SITE_ORIGIN);
    expect(served.host).not.toBeNull();
    expect(served.calls).toEqual(["loadRequest"]);
    for (const origin of ["https://evil.example", "null", null]) {
      const other = await start(origin);
      expect(other.host, String(origin)).toBeNull();
      expect(other.calls).toEqual([]);
      expect(other.workers).toEqual([]);
    }
  });

  it("asks for the geometric stage's two options: only the card under the pointer, loaded at the first pointer", () => {
    expect(productConfig(false).capabilities.geometricStage).toBe(true);
    expect(GEOMETRIC_OPTIONS).toEqual({ geometricScope: "focus", geometricLoad: "pointer" });
  });

  it("loads the geometric stage at the first pointer, not with the release (owner, 2026-11-12)", async () => {
    const request = buildLoadRequest("chrome-extension://x/release/release.json", "chrome-extension://x/runtime/", { url: "chrome-extension://x/data/geometric.json", manifestSha256: "a".repeat(64) });
    const t = await start(SITE_ORIGIN, request);
    await flush();
    const stageAsks = () => t.posted().filter((m) => m.kind === "load-stage");
    // The release loads at once, without the stage's index.
    expect(t.posted().some((m) => m.kind === "load")).toBe(true);
    expect(t.posted().some((m) => "geometricUrl" in m)).toBe(false);
    // The release is ready, the page connects: still no stage before a pointer.
    t.workers.at(-1)!.reply(statusOk(RID));
    t.page.fromPage({ kind: "hello", version: PROTOCOL_VERSION });
    await flush();
    expect(stageAsks()).toEqual([]);
    // The viewer points at the picture: the stage is asked for once.
    t.page.fromPage({ kind: "pointer", x: 0.5, y: 0.5, mediaTime: 1, touch: false });
    t.page.fromPage({ kind: "pointer", x: 0.52, y: 0.5, mediaTime: 1, touch: false });
    await flush();
    expect(stageAsks()).toHaveLength(1);
    expect(stageAsks()[0]!.geometricUrl).toBe("chrome-extension://x/data/geometric.json");
  });

  it("refuses the development idle unload outside a development build", async () => {
    const page = frameWindow(SITE_ORIGIN);
    await expect(
      startHostCompute({ config: productConfig(false), win: page.win, storage: { get: async () => ({}) }, createWorker: () => new FakeWorker(), loadRequest: () => buildLoadRequest("r", "w", null), devIdleUnloadMs: 1_000 }),
    ).rejects.toThrow();
  });
});
