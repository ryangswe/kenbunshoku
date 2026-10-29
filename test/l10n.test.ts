// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { SOURCE_FAILURE_LIMIT } from "../src/constants.js";
import { loadImage, resolveCardImage, SourceHealth } from "../src/images/chain.js";
import { localizedChoice, pickLanguage } from "../src/l10n/language.js";
import { loadLocalizedPictures, type LocalizedPictures, parseCardList } from "../src/l10n/list.js";
import type { LocalizedArt, Settings } from "../src/settings/schema.js";
import { validateSettings } from "../src/settings/schema.js";

const HOSTS = ["cdn.kenbunshoku.com", "optcgapi.com"];
const FR_TEMPLATE = "https://cdn.kenbunshoku.com/l10n/fr/{sourceFile}";
const LIST_URL = "https://cdn.kenbunshoku.com/l10n/fr/list.0123456789abcdef.json";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("pickLanguage (follows the browser, no setting)", () => {
  it.each([
    [["fr-FR", "en-US"], ["fr"], "fr"],
    [["fr-CA"], ["fr", "ja"], "fr"],
    [["FR"], ["fr"], "fr"],
    [["ja"], ["fr", "ja"], "ja"],
    [["en-US", "fr-FR"], ["fr"], null], // only the first preferred language counts
    [["de-DE"], ["fr"], null],
    [["en"], ["en"], null], // English is the usual picture, never a language of its own
    [[], ["fr"], null],
    [undefined, ["fr"], null],
  ])("%j with %j offered → %s", (preferred, offered, expected) => {
    expect(pickLanguage(preferred as string[] | undefined, offered as string[])).toBe(expected);
  });
});

describe("localizedChoice", () => {
  const art: LocalizedArt = { template: FR_TEMPLATE, list: LIST_URL, listSha256: "a".repeat(64) };
  const settings = (namesOnly: boolean, localizedArt?: Record<string, LocalizedArt>): Settings => ({
    schemaVersion: 1,
    updatedAt: "2026-10-29T00:00:00Z",
    namesOnly,
    primary: null,
    fallbacks: [],
    update: null,
    geometric: true,
    ...(localizedArt ? { localizedArt } : {}),
  });

  it("picks the browser's language when the settings offer it", () => {
    expect(localizedChoice(settings(false, { fr: art }), ["fr-FR"])).toEqual({ lang: "fr", art });
  });

  it("chooses nothing under namesOnly, so not even the card list is downloaded", () => {
    expect(localizedChoice(settings(true, { fr: art }), ["fr-FR"])).toBeNull();
  });

  it("chooses nothing when the settings offer no language (older files)", () => {
    expect(localizedChoice(settings(false), ["fr-FR"])).toBeNull();
    expect(localizedChoice(settings(false, { fr: art }), ["de-DE"])).toBeNull();
  });
});

describe("parseCardList", () => {
  it("takes card id → plain file name", () => {
    expect(parseCardList({ "OP17-040": "OP17-040.3f2a9c1b.webp", "OP17-040_p1": "OP17-040_p1.0a1b2c3d.webp" })).toEqual({
      "OP17-040": "OP17-040.3f2a9c1b.webp",
      "OP17-040_p1": "OP17-040_p1.0a1b2c3d.webp",
    });
  });

  it.each([
    ["an array", ["a"]],
    ["null", null],
    ["a file with a slash", { a: "x/y.webp" }],
    ["a file with ..", { a: "x..webp" }],
    ["a file starting with a dot", { a: ".webp" }],
    ["a number", { a: 3 }],
    ["an empty file", { a: "" }],
  ])("refuses %s", (_, raw) => {
    expect(parseCardList(raw)).toBeNull();
  });
});

describe("loadLocalizedPictures", () => {
  const body = JSON.stringify({ "OP17-040": "OP17-040.3f2a9c1b.webp" });
  const art = (listSha256 = sha(body)): LocalizedArt => ({ template: FR_TEMPLATE, list: LIST_URL, listSha256 });
  const fetchBody = (text: string, status = 200) => (async () => new Response(text, { status })) as unknown as typeof fetch;

  it("uses a list whose bytes have the given SHA-256", async () => {
    const p = await loadLocalizedPictures("fr", art(), fetchBody(body));
    expect(p).toEqual({ lang: "fr", listSha256: sha(body), source: { id: "l10n-fr", template: FR_TEMPLATE }, files: { "OP17-040": "OP17-040.3f2a9c1b.webp" } });
  });

  it("refuses a list with other bytes", async () => {
    await expect(loadLocalizedPictures("fr", art(sha("other")), fetchBody(body))).rejects.toThrow("SHA-256 mismatch");
  });

  it("refuses non-2xx, non-JSON and a list of the wrong shape", async () => {
    await expect(loadLocalizedPictures("fr", art(), fetchBody(body, 404))).rejects.toThrow("HTTP 404");
    await expect(loadLocalizedPictures("fr", art(sha("{")), fetchBody("{"))).rejects.toThrow("not JSON");
    const bad = JSON.stringify({ a: "../x" });
    await expect(loadLocalizedPictures("fr", art(sha(bad)), fetchBody(bad))).rejects.toThrow("card id: file");
  });
});

describe("the localizedArt settings field", () => {
  const FILE = {
    schemaVersion: 1,
    updatedAt: "2026-10-29T00:00:00Z",
    namesOnly: false,
    primary: { id: "cdn", template: "https://cdn.kenbunshoku.com/art/{art}" },
    fallbacks: [],
  };
  const good = { template: FR_TEMPLATE, list: LIST_URL, listSha256: "a".repeat(64) };

  it("is empty when absent, and older files stay usable", () => {
    const { settings, problems } = validateSettings(FILE, HOSTS);
    expect(settings?.localizedArt).toEqual({});
    expect(problems).toEqual([]);
  });

  it("keeps a well-formed language", () => {
    const { settings, problems } = validateSettings({ ...FILE, localizedArt: { fr: good } }, HOSTS);
    expect(settings?.localizedArt).toEqual({ fr: good });
    expect(problems).toEqual([]);
  });

  it.each([
    ["English", { en: good }],
    ["a region code", { "fr-FR": good }],
    ["an upper-case code", { FR: good }],
    ["a template without {sourceFile}", { fr: { ...good, template: "https://cdn.kenbunshoku.com/l10n/fr/{art}" } }],
    ["a template on another host", { fr: { ...good, template: "https://example.com/{sourceFile}" } }],
    ["a list on another host", { fr: { ...good, list: "https://example.com/list.json" } }],
    ["a list over http", { fr: { ...good, list: "http://cdn.kenbunshoku.com/l10n/fr/list.json" } }],
    ["a short checksum", { fr: { ...good, listSha256: "abc" } }],
    ["a missing list", { fr: { template: good.template, listSha256: good.listSha256 } }],
  ])("drops %s and keeps the file", (_, localizedArt) => {
    const { settings, problems } = validateSettings({ ...FILE, localizedArt }, HOSTS);
    expect(settings).not.toBeNull();
    expect(settings?.localizedArt).toEqual({});
    expect(problems.length).toBe(1);
  });

  it("ignores a field that is not an object, keeping the file", () => {
    const { settings, problems } = validateSettings({ ...FILE, localizedArt: "fr" }, HOSTS);
    expect(settings?.localizedArt).toEqual({});
    expect(problems).toEqual(["localizedArt: ignored (not an object)"]);
  });
});

describe("resolveCardImage with pictures in the viewer's language", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const decode = async (blob: Blob): Promise<void> => {
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 8);
    if (!PNG.every((b, i) => head[i] === b)) throw new Error("not a picture");
  };
  const settings = (namesOnly = false): Settings => ({
    schemaVersion: 1,
    updatedAt: "2026-10-29T00:00:00Z",
    namesOnly,
    primary: { id: "cdn", template: "https://cdn.kenbunshoku.com/art/{art}" },
    fallbacks: [],
    update: null,
    geometric: true,
  });
  const fr: LocalizedPictures = { lang: "fr", listSha256: "a".repeat(64), source: { id: "l10n-fr", template: FR_TEMPLATE }, files: { "OP17-040": "OP17-040.3f2a9c1b.webp" } };
  const frUrl = "https://cdn.kenbunshoku.com/l10n/fr/OP17-040.3f2a9c1b.webp";
  const enUrl = (id: string) => `https://cdn.kenbunshoku.com/art/${id}.jpg`;
  const fetchOf = (ok: Record<string, boolean>) => {
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (!ok[url]) return new Response("missing", { status: 404 });
      return new Response(PNG, { status: 200 });
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  const loader = (f: typeof fetch) => (url: string) => loadImage(url, { fetch: f, decode, timeoutMs: 50 });

  it("shows the language's picture for a card on its list", async () => {
    const { f, calls } = fetchOf({ [frUrl]: true, [enUrl("OP17-040")]: true });
    const r = await resolveCardImage({ id: "OP17-040", art: "OP17-040.jpg" }, settings(), {}, new SourceHealth(), loader(f), fr);
    expect(r.kind === "image" && r.sourceId).toBe("l10n-fr");
    expect(calls).toEqual([frUrl]);
  });

  it("goes straight to the usual picture for a card not on the list, and never counts it as a failure", async () => {
    const health = new SourceHealth();
    const { f, calls } = fetchOf({ [enUrl("OP01-001")]: true });
    for (let i = 0; i < SOURCE_FAILURE_LIMIT + 2; i++) {
      const r = await resolveCardImage({ id: "OP01-001", art: "OP01-001.jpg" }, settings(), {}, health, loader(f), fr);
      expect(r.kind === "image" && r.sourceId).toBe("cdn");
    }
    expect(calls.every((u) => u === enUrl("OP01-001"))).toBe(true);
    expect(health.skipped(fr.source)).toBe(false);
  });

  it("falls back to the usual picture when the language's picture fails", async () => {
    const { f, calls } = fetchOf({ [enUrl("OP17-040")]: true });
    const r = await resolveCardImage({ id: "OP17-040", art: "OP17-040.jpg" }, settings(), {}, new SourceHealth(), loader(f), fr);
    expect(r.kind === "image" && r.sourceId).toBe("cdn");
    expect(calls).toEqual([frUrl, enUrl("OP17-040")]);
  });

  it("requests nothing under namesOnly, the language's pictures included", async () => {
    const { f, calls } = fetchOf({ [frUrl]: true });
    const r = await resolveCardImage({ id: "OP17-040", art: "OP17-040.jpg" }, settings(true), {}, new SourceHealth(), loader(f), fr);
    expect(r).toEqual({ kind: "names", reason: "names only", attempts: [] });
    expect(calls).toEqual([]);
  });
});
