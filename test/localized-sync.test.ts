// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";

import type { LocalizedPictures } from "../src/l10n/list.js";
import type { LocalizedArt, Settings } from "../src/settings/schema.js";
import { LocalizedSync } from "../src/tooltip/localized-sync.js";

const art = (lang: string): LocalizedArt => ({ template: `https://cdn.example/l10n/${lang}/{sourceFile}`, list: `https://cdn.example/l10n/${lang}/list.json`, listSha256: lang.padEnd(64, "0") });
const settings = (namesOnly = false): Settings => ({
  schemaVersion: 1, updatedAt: "2026-11-09T00:00:00Z", namesOnly, primary: null, fallbacks: [], update: null, geometric: true,
  localizedArt: { fr: art("fr"), ja: art("ja") },
});
const pictures = (lang: string): LocalizedPictures => ({ lang, listSha256: art(lang).listSha256, source: { id: `l10n-${lang}`, template: art(lang).template }, files: {} });
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A sync whose loads wait until the test settles them, and which records what it applied. */
function harness(languages: string[], choice = "auto") {
  const pending: Array<{ lang: string; resolve(p: LocalizedPictures): void; reject(e: Error): void }> = [];
  const applied: Array<string | null> = [];
  let langs = languages;
  const sync = new LocalizedSync(
    {
      load: (lang) => new Promise((resolve, reject) => pending.push({ lang, resolve, reject })),
      apply: (p) => applied.push(p?.lang ?? null),
      languages: () => langs,
    },
    choice,
  );
  return { sync, pending, applied, setLanguages: (l: string[]) => (langs = l) };
}

describe("LocalizedSync", () => {
  it("loads the browser's language on Automatic and applies it", async () => {
    const h = harness(["ja-JP"]);
    h.sync.sync(settings());
    expect(h.pending.map((p) => p.lang)).toEqual(["ja"]);
    h.pending[0]!.resolve(pictures("ja"));
    await settle();
    expect(h.applied).toEqual(["ja"]);
  });

  it("keeps English when a slow French list lands after the viewer picked English", async () => {
    const h = harness(["fr-FR"]);
    h.sync.sync(settings());
    h.sync.cardLanguage = "en";
    h.sync.sync(settings());
    expect(h.applied).toEqual([null]);
    h.pending[0]!.resolve(pictures("fr"));
    await settle();
    expect(h.applied).toEqual([null]);
  });

  it("does not let a stale failed load clear a newer language", async () => {
    const h = harness(["fr-FR"]);
    h.sync.sync(settings());
    h.sync.cardLanguage = "ja";
    h.sync.sync(settings());
    h.pending[1]!.resolve(pictures("ja"));
    await settle();
    h.pending[0]!.reject(new Error("network"));
    await settle();
    expect(h.applied).toEqual(["ja"]);
  });

  it("applies the usual pictures when the newest load fails", async () => {
    const h = harness(["fr-FR"]);
    h.sync.sync(settings());
    h.pending[0]!.reject(new Error("network"));
    await settle();
    expect(h.applied).toEqual([null]);
  });

  it("follows a change of the browser's languages on Automatic, and not when a language is picked", async () => {
    const h = harness(["en-US"]);
    h.sync.sync(settings());
    expect(h.applied).toEqual([null]);
    h.setLanguages(["fr-CA"]);
    h.sync.sync(settings());
    expect(h.pending.map((p) => p.lang)).toEqual(["fr"]);
    h.sync.cardLanguage = "en";
    h.sync.sync(settings());
    expect(h.pending).toHaveLength(1);
    expect(h.applied).toEqual([null, null]);
  });

  it("downloads nothing with namesOnly on, whatever was picked", () => {
    const h = harness(["fr-FR"], "fr");
    h.sync.sync(settings(true));
    expect(h.pending).toHaveLength(0);
    expect(h.applied).toEqual([null]);
  });
});
