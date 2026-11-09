// SPDX-License-Identifier: Apache-2.0
// The popup's "Card language" menu (shared/card-language.ts): Automatic, then English, then each
// language the settings file offers card pictures in (its `localizedArt` entries), so a language
// added on the CDN shows here with no new version. Each is named in its own language
// ("Français"); Automatic names the language it picks now. Like the card-size dial, it cannot be
// changed until the stored choice is read, and it sits in the group the master switch grays out.
//
// A stored language the settings no longer offer shows as Automatic, which is what the tooltip
// does with it; the stored choice is kept, and shows again if the language comes back.

import { CATALOG_LANGUAGE, offeredLanguages, viewerLanguage } from "../l10n/language.js";
import { readEffectiveSettings } from "../settings/store.js";
import { AUTOMATIC, CARD_LANGUAGE_KEY, readCardLanguage } from "../shared/card-language.js";

interface Area {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** A language's name in that language, capitalized for a list ("fr" → "Français"); the code in
 *  capitals when the browser has no name for it. */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // Not a code the browser knows.
  }
  return code.toUpperCase();
}

/** The menu's entries: Automatic (with the language it picks), English, then the offered
 *  languages by name. */
export function languageOptions(offered: readonly string[], automatic: string): Array<{ value: string; label: string }> {
  const others = offered
    .filter((code) => code !== CATALOG_LANGUAGE)
    .map((code) => ({ value: code, label: languageName(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: AUTOMATIC, label: `Automatic (${languageName(automatic)})` }, { value: CATALOG_LANGUAGE, label: languageName(CATALOG_LANGUAGE) }, ...others];
}

/** Fill the menu and keep it current. Returns its render function, for storage changes (the
 *  choice, or a new settings file with other languages) and the browser's language changing. */
export function initCardLanguage(doc: Document, local: Area, languages: () => readonly string[]): { render(): Promise<void> } {
  const select = doc.getElementById("card-language") as HTMLSelectElement;
  let ready = false;
  const render = async (): Promise<void> => {
    // An unreadable storage shows Automatic, with English alone. Settings with `namesOnly` on
    // offer no other language (no localized picture is shown then).
    const choice = await readCardLanguage(local).catch(() => AUTOMATIC);
    const settings = await readEffectiveSettings(local).then((e) => e.settings).catch(() => null);
    const offered = settings ? offeredLanguages(settings) : [];
    const options = languageOptions(offered, viewerLanguage(offered, AUTOMATIC, languages()));
    select.replaceChildren(...options.map(({ value, label }) => {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = label;
      option.lang = value === AUTOMATIC ? "en" : value;
      return option;
    }));
    select.value = options.some((o) => o.value === choice) ? choice : AUTOMATIC;
    if (ready) return;
    ready = true;
    select.disabled = false;
    select.removeAttribute("aria-busy");
  };
  select.addEventListener("change", () => {
    if (!ready) return;
    void local.set({ [CARD_LANGUAGE_KEY]: select.value }).catch(() => undefined);
  });
  void render();
  return { render };
}
