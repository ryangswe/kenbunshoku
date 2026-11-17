// SPDX-License-Identifier: Apache-2.0
// Content script entry: runs in YouTube and Twitch pages (and the local test page in a dev build).
//
// The toolkit's shared hover host (vendored host-content.js, `startHostContent`) does the page's
// work: which pages are active and when each loads (at the main video's play, or at the first
// pointer over it), which video is the main one, the pointer authority under which the compute
// frame gets pictures (only the viewer's own pointer events count), when the two frames are made
// and removed (the popup's switch, a background tab, the idle unload, a frame the page removed,
// "Keep the card I'm pointing at"), the outline, and when a card is shown and hidden. Its contract
// is the toolkit's hover spec. This file gives it the extension's config (shared/product.ts) and
// the tooltip frame's adapter (tooltip-view.ts), and keeps the adapter's one input of its own, the
// popup's card size, current (card-size-sync.ts).

import { startHostContent } from "../../vendor/cardvision-browser/host-content.js";
import { productConfig } from "../shared/product.js";
import { syncCardSize } from "./card-size-sync.js";
import { TooltipView } from "./tooltip-view.js";

declare const __DEV__: boolean;

const view = new TooltipView();
const host = startHostContent({
  config: productConfig(__DEV__),
  win: window,
  doc: document,
  extensionUrl: (path) => chrome.runtime.getURL(path),
  storage: chrome.storage.local,
  storageChanges: chrome.storage.onChanged,
  view,
});

syncCardSize(view, host, chrome.storage.local, chrome.storage.onChanged);
