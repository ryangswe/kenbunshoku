// SPDX-License-Identifier: Apache-2.0
// Keeps the tooltip's localized pictures in line with the settings, the popup's card language and
// the browser's languages (l10n/language.ts). Each sync picks the language; a language other than
// English loads its picture list, and the result is applied only if no later sync has started, so
// a slow list for a language the viewer has since left never replaces what they picked after it.
// With `namesOnly` on, or English picked, nothing is downloaded and cards show their usual
// pictures.

import { localizedChoice } from "../l10n/language.js";
import type { LocalizedPictures } from "../l10n/list.js";
import type { LocalizedArt, Settings } from "../settings/schema.js";
import { AUTOMATIC } from "../shared/card-language.js";

export interface LocalizedSyncDeps {
  /** Load a language's picture list (l10n/list.ts loadLocalizedPictures). */
  load(lang: string, art: LocalizedArt): Promise<LocalizedPictures>;
  /** Use these pictures, or null for the usual ones (TooltipController.setLocalized). */
  apply(pictures: LocalizedPictures | null): void;
  /** The browser's languages, most preferred first. */
  languages(): readonly string[];
}

export class LocalizedSync {
  private calls = 0;

  constructor(
    private readonly deps: LocalizedSyncDeps,
    /** The popup's card language ("auto" for Automatic). */
    public cardLanguage: string = AUTOMATIC,
  ) {}

  /** Pick the language under these settings and apply its pictures. */
  sync(settings: Settings): void {
    const call = ++this.calls;
    const choice = localizedChoice(settings, this.deps.languages(), this.cardLanguage);
    if (!choice) {
      this.deps.apply(null);
      return;
    }
    void this.deps.load(choice.lang, choice.art).then(
      (pictures) => {
        if (call === this.calls) this.deps.apply(pictures);
      },
      () => {
        if (call === this.calls) this.deps.apply(null);
      },
    );
  }
}
