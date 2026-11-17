// SPDX-License-Identifier: Apache-2.0
// The background: it fetches the settings file at start-up, and again when a page of the
// extension asks and the last attempt is an hour old or more (settings/core.ts, the toolkit's
// settings core). It makes no other request, and none at all when the build has no settings
// address (kenbunshoku.config.json settingsUrl null). When the extension is installed or updated,
// it removes the stored entries of features that are gone (src/shared/retired.ts).

import { settingsCore } from "../settings/core.js";
import { removeRetired } from "../shared/retired.js";

const settings = settingsCore(chrome.storage.local);

const refresh = (force: boolean): Promise<unknown> => settings.refresh({ fetch: (...args) => fetch(...args), now: () => Date.now(), force }).catch(() => undefined);

chrome.runtime.onInstalled.addListener(() => {
  void removeRetired(chrome.storage.local as never).catch(() => undefined);
  void refresh(true);
});
chrome.runtime.onStartup.addListener(() => void refresh(true));

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only the extension's own pages and frames ask.
  if (sender.id !== chrome.runtime.id) return false;
  if (typeof message !== "object" || message === null || (message as { kind?: unknown }).kind !== "settings:refresh") return false;
  void refresh(false).then(() => sendResponse({ ok: true }));
  return true;
});
