// SPDX-License-Identifier: Apache-2.0
// Which language the card pictures are shown in: the browser's first preferred language, by its
// base subtag (`fr-CA` → `fr`), when the settings file offers pictures in it. Otherwise none, and
// cards show their usual (English) pictures. There is no setting: it follows the browser.

import type { LocalizedArt, Settings } from "../settings/schema.js";

/** The language to show pictures in, or null for the usual pictures. */
export function pickLanguage(preferred: readonly string[] | undefined, offered: readonly string[]): string | null {
  const first = preferred?.[0];
  if (typeof first !== "string" || first.length === 0) return null;
  const base = first.split("-")[0]!.toLowerCase();
  return base !== "en" && offered.includes(base) ? base : null;
}

/** The language's pictures to use under these settings, or null: none with `namesOnly` on (the
 *  kill switch covers them, and their card list is not even downloaded), none when the settings
 *  offer no picture in the browser's language. */
export function localizedChoice(settings: Settings, preferred: readonly string[] | undefined): { lang: string; art: LocalizedArt } | null {
  if (settings.namesOnly) return null;
  const offered = settings.localizedArt ?? {};
  const lang = pickLanguage(preferred, Object.keys(offered));
  const art = lang ? offered[lang] : undefined;
  return lang && art ? { lang, art } : null;
}
