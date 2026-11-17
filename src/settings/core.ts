// SPDX-License-Identifier: Apache-2.0
// Where the settings in effect come from (SETTINGS.md, "Failure rules"), for the background, the
// popup and the tooltip frame. The rules are the toolkit's settings core (vendored
// host-settings.js, `createSettingsCore`) run on this build's schema (schema.ts, settingsSchema):
//
//   - The settings file is fetched at start-up, then at most once an hour while the extension
//     runs (`refresh`, called by the background on start-up and whenever a page asks).
//   - A usable file replaces the last good copy, kept in extension storage with the time it was
//     fetched. It is stored even when it has not changed: the new time tells open tooltips that the
//     settings were read again (their hourly retry of failing sources), and they compare the
//     contents themselves (`same`).
//   - Anything else (unreachable, non-2xx, malformed JSON, schemaVersion other than 1, a required
//     field missing or of the wrong type) keeps the last good copy; with none, the built-in
//     default, a copy of the shipped config.json.
//   - The last good copy is validated again on every read (`read`), so a copy stored by an older
//     version is held to today's rules.
//
// The compute frame reads the same settings through its own realm's host file (host-compute.js).

import { createSettingsCore, type KeyValueStorage, type SettingsCore } from "../../vendor/cardvision-browser/host-settings.js";
import { SETTINGS_URL } from "../constants.js";
import { type Settings, settingsSchema } from "./schema.js";

/** The settings core on `storage` (chrome.storage.local). `url` is the settings file's address,
 *  this build's by default; null: nothing is fetched. A test may pass another. */
export function settingsCore(storage: KeyValueStorage, url: string | null = SETTINGS_URL): SettingsCore<Settings> {
  return createSettingsCore<Settings>(settingsSchema(url), storage);
}

/** No storage: comparing two settings reads nothing. */
const NO_STORAGE: KeyValueStorage = { get: () => Promise.resolve({}), set: () => Promise.resolve() };

const comparer = settingsCore(NO_STORAGE, null);

/** Whether two validated settings say the same thing, whatever the order of their keys. A page
 *  that reads the stored copy back gets a new object each time, so it compares the contents. */
export function sameSettings(a: Settings, b: Settings): boolean {
  return comparer.same(a, b);
}
