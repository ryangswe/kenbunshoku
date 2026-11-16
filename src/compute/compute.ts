// SPDX-License-Identifier: Apache-2.0
// The compute frame: an extension page inside the video page, hidden. It hosts the runtime's
// worker (on the extension's origin, under the extension's policy, which allows WebAssembly)
// and the session that decides when a picture is analyzed. The toolkit's shared hover host starts
// it (vendored host-compute.js, startHostCompute; its contract is the toolkit's
// docs/extension-session.md and hover spec): it checks that the embedding page is one this build
// serves, reads "Keep the card I'm pointing at" for the hold, passes the standard session options
// (pointer mode, turned outlines, measured pacing, the 10-minute idle unload) with the geometric
// stage's two (it checks only the card under the pointer, and loads at the viewer's first pointer
// over the picture), and owns the driver tick and the stop at page hide. What stays here: the
// release choice and its geometric stage, the card facts for the tooltip frame (facts.ts), the
// decision lines and the dev hook.
//
// This frame is made when the page's main video plays, or on the first pointer move over a
// video where playing does not make it (the host's page policy), so the release loads then and
// never at install. The geometric stage's card-feature index (about 60 MB, from the image host,
// kept in the browser's cache) loads at the viewer's first pointer over the picture.
// Which release: the bundled one, or the one the settings file names (the vendored
// remote-release.js, cdn/SETTINGS.md "release"), read once per page; for a remote release the
// stage follows the pointer's own index.

import { CONFIG } from "../config.js";
import { RELEASE_PATH, SETTINGS_URL, WORKER_PATH } from "../constants.js";
import { settingsSchema } from "../settings/schema.js";
import { FACTS_CHANNEL, parseFactsRequest } from "../shared/messages.js";
import { productConfig } from "../shared/product.js";
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
import { createSettingsCore, type HostCompute, startHostCompute, type WorkerLike } from "../../vendor/cardvision-browser/host-compute.js";
import type { FrameAnalysis } from "../../vendor/cardvision-browser/cardvision.js";
import { createShownFacts } from "./facts.js";
import { buildLoadRequest, type GeometricOption, type LoadRequest, stageForPage } from "./load-request.js";

declare const __DEV__: boolean;
/** Dev builds only: a shorter idle unload (`npm run build -- --dev --idle-unload-ms N`); null otherwise. */
declare const __IDLE_UNLOAD_MS__: number | null;

// Dev builds only: per-frame figures for the smoke check.
const frames: Array<Record<string, number | null>> = [];
let geometricBytes: number | null = null;
let geometricReason: string | null = null;

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

void (async () => {
  const settings = createSettingsCore(settingsSchema(), chrome.storage.local);
  const workerUrl = chrome.runtime.getURL(WORKER_PATH);
  // Filled once the host has checked the embedding page (`loadRequest` below), before the frame
  // starts: the stage for this page, the request, the bundled release's id and the facts channel.
  const page: { geometric: GeometricOption | null; request: LoadRequest | null; bundledId: string; facts: BroadcastChannel | null } = {
    geometric: null,
    request: null,
    bundledId: "-",
    facts: null,
  };
  let lastDecision: ReleaseDecision | null = null;
  let host: HostCompute | null = null;
  const settingsUrl = SETTINGS_URL;
  // `factsFor` reads the release in effect; it is asked only once the frame exists (below).
  const shownFacts = createShownFacts(
    (message) => page.facts?.postMessage(message),
    () => host!.frame.release,
  );
  host = await startHostCompute({
    config: productConfig(__DEV__),
    win: window,
    storage: chrome.storage.local,
    createWorker: () => new Worker(workerUrl, { type: "module" }) as unknown as WorkerLike,
    // Called once, after the host checked that a page this build serves embeds the frame.
    loadRequest: async () => {
      // The settings file can switch the stage off without a release (`geometric: false`).
      const stage = await stageForPage(
        async () => (await settings.read()).settings,
        (path) => chrome.runtime.getURL(path),
      );
      page.geometric = stage.option;
      // The bundled release's id, for the log line (a file inside the extension: nothing is fetched).
      page.bundledId = await fetch(chrome.runtime.getURL(RELEASE_PATH))
        .then((r) => r.json() as Promise<{ id?: string }>)
        .then((doc) => doc.id ?? "-")
        .catch(() => "-");
      page.facts = new BroadcastChannel(FACTS_CHANNEL);
      page.request = buildLoadRequest(chrome.runtime.getURL(RELEASE_PATH), new URL("./", workerUrl).href, page.geometric);
      return page.request;
    },
    release: {
      // A build with no settings address never fetches anything: the bundled release only.
      ...(settingsUrl !== null
        ? {
            chooseRelease: async (hooks: { onDownloading(): void }): Promise<RemoteReleaseChoice> => {
              const bundled = page.request!;
              // The `release` field as read once for this page: the release and its stage follow it.
              let releaseField: unknown = null;
              let choice: RemoteReleaseChoice;
              try {
                choice = await chooseRelease(
                  {
                    storage: chrome.storage.local,
                    readReleaseField: async () => (releaseField = (await settings.read()).settings.release ?? null),
                    running: chrome.runtime.getManifest().version,
                    now: () => performance.now(),
                    bundled,
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
                return { source: "bundled", reason, pointer: null, downloaded: 0, ms: 0, ...(releaseField ? { request: fallbackRequest(bundled, parseGeometricPointer(releaseField)) } : {}) };
              }
              const field = parseGeometricPointer(releaseField);
              // Chosen before anything was fetched (rules 1-5): the bundled release, with its stage.
              if (choice.source === "bundled") return chosenBeforeFetch(choice.reason) ? choice : { ...choice, request: fallbackRequest(bundled, field) };
              const check = await checkRemoteGeometric(field, page.geometric !== null, { fetch: (...args) => fetch(...args), sha256Hex, settingsUrl });
              geometricReason = check.ok ? "ok" : check.reason;
              console.info(geometricLine(CONFIG.name, choice.pointer.id, check));
              const request = check.ok ? { ...choice.request, geometricUrl: check.url, geometricManifestSha256: check.manifestSha256 } : choice.request;
              return { ...choice, request, fallback: fallbackRequest(bundled, field) };
            },
            recordSkip: (pointer, reason) => void recordSkip(chrome.storage.local, pointer, reason).catch(() => undefined),
          }
        : {}),
      onDecision: (d) => {
        lastDecision = d;
        // Local only, never sent: no page, channel, video, frame or card.
        console.info(decisionLine(CONFIG.name, d, page.bundledId));
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
    },
    observe: {
      // A remote release's card facts go to the tooltip frame before the card itself (facts.ts).
      onShown: (card, release) => shownFacts.onShown(card, release),
      ...(__DEV__
        ? {
            onAnalysis: (analysis: FrameAnalysis) => {
              // A reused repeat of a still picture (toolkit #89) is the previous analysis again:
              // counting it would count the same faces twice.
              if (analysis.reused) return;
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
    },
    // Dev builds only: a shorter idle unload, to check the unload quickly.
    ...(__IDLE_UNLOAD_MS__ !== null ? { devIdleUnloadMs: __IDLE_UNLOAD_MS__ } : {}),
  });
  // Not a page this build serves: nothing was read and nothing runs.
  if (!host) return;
  const frame = host.frame;
  if (page.geometric) {
    // Ask the browser to keep the index's cache under storage pressure. Only a page can ask
    // (not the worker that fills the cache), so this frame does.
    void navigator.storage?.persist?.().catch(() => false);
  }
  // A tooltip frame that lacks a card's facts asks for them on the channel (one made again, or a
  // card that arrived before its facts); the frame whose release it is answers.
  const facts = page.facts;
  if (facts) {
    facts.onmessage = (event: MessageEvent) => {
      const want = parseFactsRequest(event.data);
      const answer = want ? shownFacts.factsFor(want.releaseId, want.cardId) : null;
      if (answer) facts.postMessage(answer);
    };
  }
  if (__DEV__) {
    // Dev builds only: what the smoke check and the hover browser test read.
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
