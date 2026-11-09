// SPDX-License-Identifier: Apache-2.0
// Which language the card pictures are shown in: the one chosen in the popup's "Card language"
// (shared/card-language.ts) when the settings file offers pictures in it (`localizedArt`); on
// "Automatic", the browser's. English is the catalog's language: its pictures are the usual
// ones, never a `localizedArt` entry.
//
// Automatic (the toolkit's language recipe, `viewerLanguage`): the browser's preferred languages
// in order, base subtag only (`fr-CA` → `fr`); the first that is English or offered wins, and
// English when none is. So ["ja", "fr"] gives French, and ["en-US", "fr"] English. Chrome and
// Firefox give the same list (navigator.languages). A chosen language the settings no longer
// offer is treated as Automatic.

import type { LocalizedArt, Settings } from "../settings/schema.js";
import { AUTOMATIC } from "../shared/card-language.js";

/** The catalog's own language: its pictures are the usual ones. */
export const CATALOG_LANGUAGE = "en";

/** A language tag's base subtag, lowercase (`fr-CA` → `fr`). */
const baseOf = (tag: string): string => (tag.split(/[-_]/)[0] ?? "").toLowerCase();

/** The language the pictures are shown in: the choice when it is English or offered, else the
 *  first of the browser's languages that is, else English. */
export function viewerLanguage(offered: readonly string[], choice: string = AUTOMATIC, preferred: readonly string[] | undefined = []): string {
  if (choice !== AUTOMATIC && (choice === CATALOG_LANGUAGE || offered.includes(choice))) return choice;
  for (const tag of preferred ?? []) {
    if (typeof tag !== "string" || tag.length === 0) continue;
    const base = baseOf(tag);
    if (base === CATALOG_LANGUAGE || (base.length > 0 && offered.includes(base))) return base;
  }
  return CATALOG_LANGUAGE;
}

/** The languages the settings offer pictures in, or none with `namesOnly` on (the kill switch
 *  covers them, and their card list is not even downloaded). */
export function offeredLanguages(settings: Settings): string[] {
  return settings.namesOnly ? [] : Object.keys(settings.localizedArt ?? {});
}

/** The language's pictures to use under these settings, or null for the usual (English) pictures:
 *  none with `namesOnly` on, none when the language picked is English. */
export function localizedChoice(settings: Settings, preferred: readonly string[] | undefined, choice: string = AUTOMATIC): { lang: string; art: LocalizedArt } | null {
  const lang = viewerLanguage(offeredLanguages(settings), choice, preferred);
  const art = lang !== CATALOG_LANGUAGE && settings.localizedArt ? settings.localizedArt[lang] : undefined;
  return art ? { lang, art } : null;
}
