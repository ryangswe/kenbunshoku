// SPDX-License-Identifier: Apache-2.0
// The tooltip frame: an extension page the content script places beside a card. It shows the
// card's picture alone (from the sources the settings name, in order), or the card's name when
// there is no picture. Nothing in it can be clicked: the pointer passes through to the video.
// Being an extension page, it loads pictures under the extension's host permissions and policy,
// not the video site's. The logic is in controller.ts.

import { loadImage } from "../images/chain.js";
import { loadLocalizedPictures } from "../l10n/list.js";
import type { Settings } from "../settings/schema.js";
import { LAST_GOOD_KEY, readEffectiveSettings } from "../settings/store.js";
import { AUTOMATIC, CARD_LANGUAGE_KEY, parseCardLanguage, readCardLanguage } from "../shared/card-language.js";
import { type CardTable, parseSourceFileMaps } from "./card-data.js";
import { connectTooltipFrame, TooltipController } from "./controller.js";
import { frameHasShape, type ShapeWindow } from "./frame-shape.js";
import { LocalizedSync } from "./localized-sync.js";
import { FACTS_CHANNEL, parseCardFacts, type TooltipOut } from "../shared/messages.js";

declare const __DEV__: boolean;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(chrome.runtime.getURL(path));
  return response.ok ? response.json() : null;
}

const decode = async (blob: Blob): Promise<void> => {
  const bitmap = await createImageBitmap(blob);
  bitmap.close();
};

let post: ((message: TooltipOut) => void) | null = null;

/** The browser's languages, most preferred first. */
const browserLanguages = (): readonly string[] => (navigator.languages?.length ? navigator.languages : [navigator.language]);

void (async () => {
  const framed = window.parent !== window;
  const parentOrigin = location.ancestorOrigins?.[0] ?? null;
  const factsChannel = new BroadcastChannel(FACTS_CHANNEL);
  const [cards, files, effective, language] = await Promise.all([
    fetchJson("data/cards.json"),
    fetchJson("data/source-files.json"),
    readEffectiveSettings(chrome.storage.local),
    readCardLanguage(chrome.storage.local).catch(() => AUTOMATIC),
  ]);
  const controller = new TooltipController({
    elements: { root: $("card"), art: $("art"), img: $<HTMLImageElement>("img"), placeholder: $("placeholder"), pill: $("pill") },
    table: (cards ?? {}) as CardTable,
    maps: parseSourceFileMaps(files),
    load: (url) => loadImage(url, { fetch: (...args) => fetch(...args), decode }),
    imageSize: async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    },
    requestRefresh: () => void chrome.runtime.sendMessage({ kind: "settings:refresh" }).catch(() => undefined),
    requestFacts: (releaseId, cardId) => factsChannel.postMessage({ want: true, releaseId, cardId }),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    onSize: (size) => post?.({ kind: "size", ...size }),
    frameFits: (size) => frameHasShape(size, window as unknown as ShapeWindow),
  });
  controller.setSettings(effective.settings);
  // Pictures in the popup's card language, or on Automatic the browser's (localized-sync.ts).
  const localized = new LocalizedSync(
    {
      load: (lang, art) => loadLocalizedPictures(lang, art, (...args) => fetch(...args)),
      apply: (pictures) => controller.setLocalized(pictures),
      languages: browserLanguages,
    },
    language,
  );
  localized.sync(effective.settings);
  // Facts of a remote release's cards come from a compute frame over this channel, never through
  // the page (the page can post `card` messages to this frame, not here).
  factsChannel.onmessage = (event: MessageEvent) => {
    const m = parseCardFacts(event.data);
    if (m) controller.addFacts(m.releaseId, { id: m.cardId, ...m.facts });
  };
  post = connectTooltipFrame({ win: window, framed, parentOrigin, dev: __DEV__ }, controller);
  if (!post) return;
  const send = post;
  let settingsNow = effective.settings;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (CARD_LANGUAGE_KEY in changes) localized.cardLanguage = parseCardLanguage((changes[CARD_LANGUAGE_KEY] as { newValue?: unknown } | undefined)?.newValue);
    if (LAST_GOOD_KEY in changes) {
      void readEffectiveSettings(chrome.storage.local).then((e) => {
        settingsNow = e.settings;
        controller.setSettings(e.settings);
        localized.sync(e.settings);
      });
    } else if (CARD_LANGUAGE_KEY in changes) {
      localized.sync(settingsNow);
    }
  });
  // The browser's language changed: on Automatic, the pictures follow it.
  window.addEventListener("languagechange", () => localized.sync(settingsNow));
  // The pill's size follows its text's layout (fonts can arrive late).
  const pill = $("pill");
  new ResizeObserver(() => {
    const r = pill.getBoundingClientRect();
    if (!pill.hidden && r.width > 0 && r.height > 0 && controller.current) {
      const seq = controller.currentSeq;
      send({ kind: "size", width: Math.ceil(r.width), height: Math.ceil(r.height), shape: "pill", cardId: controller.current, ...(seq !== undefined ? { seq } : {}) });
    }
  }).observe(pill);
  // The background fetches the settings file when it is due (at most once an hour).
  void chrome.runtime.sendMessage({ kind: "settings:refresh" }).catch(() => undefined);
  send({ kind: "ready" });
})();
