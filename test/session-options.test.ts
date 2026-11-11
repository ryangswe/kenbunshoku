// SPDX-License-Identifier: Apache-2.0
// The compute frame's fixed session options (src/compute/session-options.ts) on the toolkit's
// vendored compute frame: the frame starts with them, and they check only the card under the
// pointer, which the toolkit allows in pointer mode only.
import { describe, expect, it } from "vitest";

import { SESSION_OPTIONS } from "../src/compute/session-options.js";
import { allowedParentOrigin, TAG } from "../src/shared/messages.js";
import { computeProtocol, startComputeFrame } from "../vendor/cardvision-browser/compute-session.js";
import { SITE_ORIGIN } from "./helpers/fork.js";
import { FakeWorker } from "./helpers/remote-frame.js";

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

  it("would stop the frame from starting in another mode, so compute.ts sets none", () => {
    expect(() => start({ mode: "always-on" })).toThrow();
  });
});
