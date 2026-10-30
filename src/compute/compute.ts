// SPDX-License-Identifier: Apache-2.0
// The compute frame: an extension page inside the video page, hidden. It hosts the runtime's
// worker (on the extension's origin, under the extension's policy, which allows WebAssembly)
// and the session that decides when a picture is analyzed: the toolkit's compute frame
// (vendored compute-session.js, startComputeFrame; its contract is the toolkit's
// docs/extension-session.md). What stays here: the origins it serves, the release choice and its
// geometric stage, the card facts for the tooltip frame (facts.ts), and the dev hook.
//
// This frame is made on the first pointer move over a video's picture (the page's session
// starts then), so the release, and after it the geometric stage's card-feature index (about
// 60 MB, from the image host, kept in the browser's cache), load then and never at install.
// Which release: the bundled one, or the one the settings file names (the vendored
// remote-release.js, cdn/SETTINGS.md "release"), read once per page; for a remote release the
// stage follows the pointer's own index.

import { CONFIG } from "../config.js";
import { RELEASE_PATH, SETTINGS_URL, WORKER_PATH } from "../constants.js";
import { readEffectiveSettings } from "../settings/store.js";
import { allowedParentOrigin, FACTS_CHANNEL, parseFactsRequest, TAG } from "../shared/messages.js";
import {
  buildCardTable,
  checkRemoteGeometric,
  chooseRelease,
  chosenBeforeFetch,
  decisionLine,
  fallbackRequest,
  geometricLine,
  parseGeometricPointer,
  recordSkip,
  type ReleaseDecision,
  type RemoteReleaseChoice,
} from "../../vendor/cardvision-browser/remote-release.js";
import { computeProtocol, DRIVER_TICK_MS, SHOWN_HOLD, startComputeFrame, type WorkerLike } from "../../vendor/cardvision-browser/compute-session.js";
import type { FrameAnalysis } from "../../vendor/cardvision-browser/cardvision.js";
import { createShownFacts } from "./facts.js";
import { buildLoadRequest, stageForPage } from "./load-request.js";

declare const __DEV__: boolean;

// Dev builds only: per-frame figures for the smoke check.
const frames: Array<Record<string, number | null>> = [];
let geometricBytes: number | null = null;
let geometricReason: string | null = null;

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

void (async () => {
  const framed = window.parent !== window;
  // Chrome and Firefox 148 or later (the Firefox build's minimum). A referrer policy that hides
  // the parent makes it the string "null": none is set on this frame (agent.ts).
  const ancestor = location.ancestorOrigins?.[0] ?? null;
  const parentOrigin = ancestor === "null" ? null : ancestor;
  if (!framed || parentOrigin === null || !allowedParentOrigin(parentOrigin, __DEV__)) return;
  // The settings file can switch the stage off without a release (`geometric: false`).
  const stage = await stageForPage(
    async () => (await readEffectiveSettings(chrome.storage.local)).settings,
    (path) => chrome.runtime.getURL(path),
  );
  const geometric = stage.option;
  if (geometric) {
    // Ask the browser to keep the index's cache under storage pressure. Only a page can ask
    // (not the worker that fills the cache), so this frame does.
    void navigator.storage?.persist?.().catch(() => false);
  }
  const workerUrl = chrome.runtime.getURL(WORKER_PATH);
  const loadRequest = buildLoadRequest(chrome.runtime.getURL(RELEASE_PATH), new URL("./", workerUrl).href, geometric);
  const facts = new BroadcastChannel(FACTS_CHANNEL);
  // The bundled release's id, for the log line (a file inside the extension: nothing is fetched).
  const bundledId = await fetch(chrome.runtime.getURL(RELEASE_PATH))
    .then((r) => r.json() as Promise<{ id?: string }>)
    .then((doc) => doc.id ?? "-")
    .catch(() => "-");
  let lastDecision: ReleaseDecision | null = null;
  const settingsUrl = SETTINGS_URL;
  // `factsFor` reads the release in effect; it is asked only once the frame exists (below).
  const shownFacts = createShownFacts(
    (message) => facts.postMessage(message),
    () => frame!.release,
  );
  const frame = startComputeFrame({
    win: window,
    framed,
    parentOrigin,
    allowedParentOrigin: (origin) => allowedParentOrigin(origin, __DEV__),
    protocol: computeProtocol(TAG),
    // A shown card is kept through short gaps (two empty analyses in a row, or 5 s): no flicker on
    // a live stream.
    hold: SHOWN_HOLD,
    onShown: (card, release) => shownFacts.onShown(card, release),
    createWorker: () => new Worker(workerUrl, { type: "module" }) as unknown as WorkerLike,
    loadRequest,
    now: () => performance.now(),
    // A build with no settings address never fetches anything: the bundled release only.
    ...(settingsUrl !== null
      ? {
          chooseRelease: async (hooks: { onDownloading(): void }): Promise<RemoteReleaseChoice> => {
            // The `release` field as read once for this page: the release and its stage follow it.
            let releaseField: unknown = null;
            let choice: RemoteReleaseChoice;
            try {
              choice = await chooseRelease(
              {
                storage: chrome.storage.local,
                readReleaseField: async () => (releaseField = (await readEffectiveSettings(chrome.storage.local)).settings.release ?? null),
                running: chrome.runtime.getManifest().version,
                now: () => performance.now(),
                bundled: loadRequest,
                buildCardTable: (catalog) => buildCardTable(catalog, { printed: CONFIG.printedNumber === "catalog" }),
                fetch: (...args) => fetch(...args),
                sha256Hex,
                settingsUrl,
                extensionUrl: (path) => chrome.runtime.getURL(path),
              },
              hooks,
            );
            } catch (error) {
              // After a pointer was read, anything unexpected is a fallback like rules 6-12: the stage
              // stays off unless the pointer's index is the bundled one (the remote index stays cached).
              const reason = `unexpected:${String(error)}`;
              return { source: "bundled", reason, pointer: null, downloaded: 0, ms: 0, ...(releaseField ? { request: fallbackRequest(loadRequest, parseGeometricPointer(releaseField)) } : {}) };
            }
            const field = parseGeometricPointer(releaseField);
            // Chosen before anything was fetched (rules 1-5): the bundled release, with its stage.
            if (choice.source === "bundled") return chosenBeforeFetch(choice.reason) ? choice : { ...choice, request: fallbackRequest(loadRequest, field) };
            const check = await checkRemoteGeometric(field, geometric !== null, { fetch: (...args) => fetch(...args), sha256Hex, settingsUrl });
            geometricReason = check.ok ? "ok" : check.reason;
            console.info(geometricLine(CONFIG.name, choice.pointer.id, check));
            const request = check.ok ? { ...choice.request, geometricUrl: check.url, geometricManifestSha256: check.manifestSha256 } : choice.request;
            return { ...choice, request, fallback: fallbackRequest(loadRequest, field) };
          },
          recordSkip: (pointer, reason) => void recordSkip(chrome.storage.local, pointer, reason).catch(() => undefined),
        }
      : {}),
    onDecision: (d) => {
      lastDecision = d;
      // Local only, never sent: no page, channel, video, frame or card.
      console.info(decisionLine(CONFIG.name, d, bundledId));
    },
    onGeometricStatus: (status) => {
      if (__DEV__) geometricBytes = status.bytes;
      // G3: the runtime refused the remote release's index; the release runs with the stage off.
      // A restart's own "worker-restarted" is the frame's, not the runtime's: rule 12 logs it.
      if (status.state === "off" && status.reason && status.reason !== "worker-restarted" && lastDecision?.source === "remote") {
        geometricReason = `geo-runtime:${status.reason}`;
        console.info(`[${CONFIG.name}] geometric source=off reason=${geometricReason} pointer=${lastDecision.pointer ?? "-"}`);
      }
    },
    ...(__DEV__
      ? {
          onAnalysis: (analysis: FrameAnalysis) => {
            const faces = analysis.boxes.filter((b) => b.face);
            frames.push({
              analyzeMs: analysis.timings.analyzeMs,
              detectorMs: analysis.timings.detectorMs,
              recognizeMs: analysis.timings.recognizeMs,
              geometricMs: analysis.timings.geometricMs ?? null,
              faces: faces.length,
              verified: faces.filter((b) => b.face?.geometric).length,
              changed: faces.filter((b) => b.face?.geometric && b.face.geometric.before.topId !== b.face.topId).length,
            });
            if (frames.length > 200) frames.shift();
          },
        }
      : {}),
  });
  if (!frame) return;
  // A tooltip frame that lacks a card's facts asks for them on the channel (one made again, or a
  // card that arrived before its facts); the frame whose release it is answers.
  facts.onmessage = (event: MessageEvent) => {
    const want = parseFactsRequest(event.data);
    const answer = want ? shownFacts.factsFor(want.releaseId, want.cardId) : null;
    if (answer) facts.postMessage(answer);
  };
  const ticker = setInterval(() => frame.tick(), DRIVER_TICK_MS);
  addEventListener("pagehide", () => {
    clearInterval(ticker);
    frame.stop();
  });
  if (__DEV__) {
    // Dev builds only: what the smoke check reads (test/smoke/smoke.mjs).
    (window as unknown as { __kenbunshokuDebug: () => unknown }).__kenbunshokuDebug = () => {
      const status = frame.core?.status() ?? null;
      return {
        state: status?.state ?? "loading",
        error: status?.error ?? null,
        backend: status?.backend ?? null,
        analyzed: status?.frames ?? 0,
        lastFrameError: status?.lastFrameError ?? null,
        lastWorkerMs: status?.lastWorkerMs ?? null,
        restarts: frame.restarts,
        stopped: frame.stopped,
        release: { source: frame.release.source, id: frame.release.id, reason: frame.release.reason, decision: lastDecision },
        geometric: status?.geometric ?? null,
        geometricBytes,
        geometricReason,
        frames,
      };
    };
  }
})();
