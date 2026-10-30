// SPDX-License-Identifier: Apache-2.0
// The toolkit's compute frame (vendored compute-session.js) on a remote release, with a stand-in
// worker, and Kenbunshoku's card facts (src/compute/facts.ts) wired to it as compute.ts wires them.
import type { ReleaseStatus } from "../../vendor/cardvision-browser/cardvision.js";
import { computeProtocol, type ShownCard, startComputeFrame, type WorkerLike } from "../../vendor/cardvision-browser/compute-session.js";
import type { CardTable, RemoteReleaseChoice } from "../../vendor/cardvision-browser/remote-release.js";
import { createShownFacts } from "../../src/compute/facts.js";
import { allowedParentOrigin, type CardFactsMessage, TAG } from "../../src/shared/messages.js";
import { SITE_ORIGIN } from "./fork.js";

export const RID = "0123456789abcdef";

export class FakeWorker implements WorkerLike {
  posted: Array<Record<string, unknown>> = [];
  terminated = false;
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  postMessage(message: unknown) {
    this.posted.push(message as Record<string, unknown>);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail(message = "boom") {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const releaseOf = (id: string) =>
  ({
    id, game: "onepiece", locale: "en",
    detector: { version: "d", ep: "wasm" }, recognizer: { version: "r", ep: "wasm" },
    bankCards: 1, catalogCards: 1, identityLevel: "name",
    decode: { threshold: 0.3, nmsIou: 0.45, maxProposals: 80, minCropPx: 24 },
    accept: { tau: 0.68, delta: 0.06 }, hoverSelection: "accepted-nms", hoverMaxAgeMs: 2000,
    analysisWidth: { min: 720, max: 1920 }, ortWeb: "1.29.0",
  }) as unknown as NonNullable<ReleaseStatus["release"]>;

export const statusOk = (id: string) => ({ kind: "release-status", ok: true, error: null, release: releaseOf(id), cards: [] });

export const card = (cardId: string, name = "A Card"): ShownCard => ({ cardId, name, releaseId: RID, box: { x: 0, y: 0, width: 0.1, height: 0.1 }, others: [] });

/** A frame that chose the remote release `RID` with this card table; `confirm()` is the worker's yes. */
export async function remoteFrame(table: CardTable) {
  const workers: FakeWorker[] = [];
  const posted: CardFactsMessage[] = [];
  const choice: RemoteReleaseChoice = {
    source: "remote",
    pointer: { id: RID, path: `vision/releases/${RID}/release.json`, sha256: "a".repeat(64), minimumExtensionVersion: "0.3.0", maximumExtensionVersion: null },
    request: { kind: "load", releaseUrl: "release.json", files: {} },
    facts: table,
    reused: 2,
    downloaded: 1,
    ms: 1,
  };
  const shownFacts = createShownFacts(
    (message) => void posted.push(message),
    () => frame.release,
  );
  const frame = startComputeFrame({
    win: { parent: { postMessage: () => undefined }, addEventListener: () => undefined, removeEventListener: () => undefined },
    framed: true,
    parentOrigin: SITE_ORIGIN,
    allowedParentOrigin: (origin) => allowedParentOrigin(origin, false),
    protocol: computeProtocol(TAG),
    createWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    loadRequest: { kind: "load", releaseUrl: "chrome-extension://x/release/release.json" },
    now: () => 0,
    chooseRelease: async () => choice,
    onShown: (shown, release) => shownFacts.onShown(shown, release),
  })!;
  await new Promise((r) => setTimeout(r, 0));
  return {
    frame,
    workers,
    posted,
    shownFacts,
    confirm: (id = RID) => workers.at(-1)!.reply(statusOk(id)),
    /** What the frame does before it posts a shown card: our hook, with the release in effect. */
    show: (shown: ShownCard | null) => shownFacts.onShown(shown, frame.release),
  };
}
