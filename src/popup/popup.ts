// SPDX-License-Identifier: Apache-2.0
// The popup: the master switch, the card language menu and the card-size dial (both dimmed while
// hovers are off), and a "New version available" line when there is one (view.ts).

import { initPopup } from "./view.js";

declare const __TARGET__: "chrome" | "firefox";

const popup = initPopup({
  doc: document,
  local: chrome.storage.local as never,
  onChanged: chrome.storage.onChanged as never,
  version: chrome.runtime.getManifest().version,
  // Firefox installs only signed add-ons and updates them itself: no zip install to tell about.
  updateNotices: __TARGET__ !== "firefox",
  languages: () => (navigator.languages?.length ? navigator.languages : [navigator.language]),
});
// The browser's language changed: Automatic may name another language.
window.addEventListener("languagechange", () => void popup.renderLanguage());
chrome.runtime.sendMessage({ kind: "settings:refresh" }).catch(() => undefined);
