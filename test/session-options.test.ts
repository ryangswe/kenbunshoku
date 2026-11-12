// SPDX-License-Identifier: Apache-2.0
// The compute frame's fixed session options (src/compute/session-options.ts) on the toolkit's
// vendored compute frame: the frame starts with them, and they check only the card under the
// pointer, which the toolkit allows in pointer mode only.
import { describe, expect, it } from "vitest";

import { SESSION_OPTIONS, sessionOptions } from "../src/compute/session-options.js";
import { allowedParentOrigin, tag, TAG } from "../src/shared/messages.js";
import { computeProtocol, PROTOCOL_VERSION, startComputeFrame } from "../vendor/cardvision-browser/compute-session.js";
import { SITE_ORIGIN } from "./helpers/fork.js";
import { FakeWorker, RID, statusOk } from "./helpers/remote-frame.js";

const start = (extra: Record<string, unknown> = {}) =>
  startComputeFrame({
    win: { parent: { postMessage: () => undefined }, addEventListener: () => undefined, removeEventListener: () => undefined },
    framed: true,
    parentOrigin: SITE_ORIGIN,
    allowedParentOrigin: (origin) => allowedParentOrigin(origin, false),
    protocol: computeProtocol(TAG),
    ...SESSION_OPTIONS,
    createWorker: () => new FakeWorker(),
    loadRequest: { kind: "load", releaseUrl: "chrome-extension://x/release/release.json" },
    now: () => 0,
    ...extra,
  } as Parameters<typeof startComputeFrame>[0]);

describe("compute frame session options", () => {
  it("check only the card under the pointer", () => {
    expect(SESSION_OPTIONS.geometricScope).toBe("focus");
  });

  it("start the toolkit's compute frame in its default pointer mode", () => {
    expect(start()).not.toBeNull();
  });

  it("start the frame with either hold the popup's switch picks", () => {
    for (const on of [true, false]) expect(start(sessionOptions(on))).not.toBeNull();
  });

  it("load the geometric stage at the first pointer, not with the release (owner, 2026-11-12)", async () => {
    expect(SESSION_OPTIONS.geometricLoad).toBe("pointer");
    const workers: FakeWorker[] = [];
    const listeners: Array<(event: MessageEvent) => void> = [];
    const parent = { postMessage: () => undefined };
    start({
      win: { parent, addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.push(fn), removeEventListener: () => undefined },
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
      loadRequest: { kind: "load", releaseUrl: "chrome-extension://x/release/release.json", geometricUrl: "chrome-extension://x/geometric/index.json" },
    });
    const flush = async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    };
    const fromPage = (data: Record<string, unknown>) => {
      for (const fn of listeners) fn({ data: tag(data), origin: SITE_ORIGIN, source: parent } as unknown as MessageEvent);
    };
    const posted = () => workers.flatMap((w) => w.posted);
    const stageAsks = () => posted().filter((m) => m.kind === "load-stage");
    await flush();
    // The release loads at once, without the stage's index.
    expect(posted().some((m) => m.kind === "load")).toBe(true);
    expect(posted().some((m) => "geometricUrl" in m)).toBe(false);
    // The release is ready, the page connects: still no stage before a pointer.
    workers.at(-1)!.reply(statusOk(RID));
    fromPage({ kind: "hello", version: PROTOCOL_VERSION });
    await flush();
    expect(stageAsks()).toEqual([]);
    // The viewer points at the picture: the stage is asked for once.
    fromPage({ kind: "pointer", x: 0.5, y: 0.5, mediaTime: 1, touch: false });
    fromPage({ kind: "pointer", x: 0.52, y: 0.5, mediaTime: 1, touch: false });
    await flush();
    expect(stageAsks()).toHaveLength(1);
    expect(stageAsks()[0]!.geometricUrl).toBe("chrome-extension://x/geometric/index.json");
  });

  it("would stop the frame from starting in another mode, so compute.ts sets none", () => {
    expect(() => start({ mode: "always-on" })).toThrow();
  });
});
