// SPDX-License-Identifier: Apache-2.0
// Where the settings in effect come from (SETTINGS.md, "Failure rules"): the toolkit's settings core
// (vendored host-settings.js) on this build's schema and default (src/settings/core.ts).
import { describe, expect, it } from "vitest";

import { SETTINGS_URL, UPDATE_URL_PREFIX } from "../src/constants.js";
import DEFAULT_CONFIG from "../cdn/config.json";
import { settingsCore } from "../src/settings/core.js";
import { type KeyValueStorage, LAST_ATTEMPT_KEY, LAST_GOOD_KEY, SETTINGS_REFRESH_MS } from "../vendor/cardvision-browser/host-settings.js";

class MemoryStorage implements KeyValueStorage {
  data: Record<string, unknown> = {};
  async get(keys: string | string[]) {
    const out: Record<string, unknown> = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) if (k in this.data) out[k] = structuredClone(this.data[k]);
    return out;
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, structuredClone(items));
  }
}

const json = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

function fetchReturning(...answers: Array<Response | Error>): typeof fetch & { urls: string[] } {
  const urls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const a = answers.shift();
    if (!a) throw new Error("unexpected request");
    if (a instanceof Error) throw a;
    return a;
  }) as typeof fetch & { urls: string[] };
  fn.urls = urls;
  return fn;
}

/** A newer settings file (the bundled one, changed); with an update notice when the build shows them. */
const live = {
  ...DEFAULT_CONFIG,
  updatedAt: "2026-11-01T00:00:00Z",
  namesOnly: true,
  ...(UPDATE_URL_PREFIX ? { update: { latest: "0.2.0", url: `${UPDATE_URL_PREFIX}/tag/v0.2.0` } } : {}),
};
/** The address these tests fetch (any build's, so that a build with none is tested too). */
const URL_UNDER_TEST = "https://settings.example/config.json";
const s0 = () => new MemoryStorage();

/** The settings in effect, as the background, the popup and the tooltip frame read them. */
const readEffectiveSettings = (s: KeyValueStorage) => settingsCore(s).read();

describe("the settings in effect", () => {
  it("uses the built-in default when nothing was ever fetched", async () => {
    const r = await readEffectiveSettings(new MemoryStorage());
    expect(r.origin).toBe("default");
    expect(r.settings).toEqual(settingsCore(s0()).defaults());
  });

  it("uses the last good copy", async () => {
    const s = new MemoryStorage();
    s.data[LAST_GOOD_KEY] = { raw: live, fetchedAt: 5 };
    const r = await readEffectiveSettings(s);
    expect(r.origin).toBe("fetched");
    expect(r.settings.namesOnly).toBe(true);
    expect(r.fetchedAt).toBe(5);
  });

  it("falls back to the default when the stored copy is no longer valid", async () => {
    const s = new MemoryStorage();
    s.data[LAST_GOOD_KEY] = { raw: { ...live, schemaVersion: 2 }, fetchedAt: 5 };
    expect((await readEffectiveSettings(s)).origin).toBe("default");
  });
});

describe("the settings refresh", () => {
  it("fetches the settings address and keeps a usable file", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(json(live));
    const r = await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 1000, force: true });
    expect(r.kind).toBe("updated");
    expect(f.urls).toEqual([URL_UNDER_TEST]);
    expect(s.data[LAST_GOOD_KEY]).toEqual({ raw: live, fetchedAt: 1000 });
    if (UPDATE_URL_PREFIX) expect((await readEffectiveSettings(s)).settings.update?.latest).toBe("0.2.0");
  });

  it("stores an unchanged file again, with the new time (open tooltips retry on that change)", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(json(live), json(live));
    await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 1000, force: true });
    const r = await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 1000 + SETTINGS_REFRESH_MS, force: true });
    expect(r.kind).toBe("updated");
    expect(s.data[LAST_GOOD_KEY]).toEqual({ raw: live, fetchedAt: 1000 + SETTINGS_REFRESH_MS });
  });

  it("fetches the build's own settings address by default", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(json(live));
    const r = await settingsCore(s).refresh({ fetch: f, now: () => 1000, force: true });
    if (SETTINGS_URL === null) {
      expect(r.kind).toBe("skipped");
      expect(f.urls).toEqual([]);
    } else expect(f.urls).toEqual([SETTINGS_URL]);
  });

  it("fetches nothing at all when the build has no settings address", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(json(live));
    expect((await settingsCore(s, null).refresh({ fetch: f, now: () => 1000, force: true })).kind).toBe("skipped");
    expect(f.urls).toEqual([]);
    expect(s.data).toEqual({});
  });

  it("fetches at most once an hour unless forced (start-up)", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(json(live), json(live), json(live));
    await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 0, force: true });
    expect((await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => SETTINGS_REFRESH_MS - 1 })).kind).toBe("skipped");
    expect((await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => SETTINGS_REFRESH_MS })).kind).toBe("updated");
    expect((await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => SETTINGS_REFRESH_MS + 1, force: true })).kind).toBe("updated");
    expect(f.urls.length).toBe(3);
  });

  it("records the attempt even when it fails, so a failing host is not hammered", async () => {
    const s = new MemoryStorage();
    const f = fetchReturning(new TypeError("offline"));
    await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 77, force: true });
    expect(s.data[LAST_ATTEMPT_KEY]).toBe(77);
    expect((await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: f, now: () => 78 })).kind).toBe("skipped");
  });

  it.each([
    ["unreachable", new TypeError("offline"), /unreachable/],
    ["non-2xx", json(live, 500), /HTTP 500/],
    ["malformed JSON", json("{ not json"), /malformed JSON/],
    ["schemaVersion 2", json({ ...live, schemaVersion: 2 }), /schemaVersion/],
    ["a required field missing", json({ schemaVersion: 1, namesOnly: false }), /updatedAt/],
  ])("keeps the last good copy when the file is %s", async (_, answer, reason) => {
    const s = new MemoryStorage();
    s.data[LAST_GOOD_KEY] = { raw: live, fetchedAt: 1 };
    const r = await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: fetchReturning(answer), now: () => 2, force: true });
    expect(r.kind).toBe("kept");
    expect(r.kind === "kept" && r.reason).toMatch(reason);
    expect(s.data[LAST_GOOD_KEY]).toEqual({ raw: live, fetchedAt: 1 });
    expect((await readEffectiveSettings(s)).settings.namesOnly).toBe(true);
  });

  it("with no last good copy, a bad file leaves the built-in default in effect", async () => {
    const s = new MemoryStorage();
    await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: fetchReturning(json("[]")), now: () => 2, force: true });
    expect((await readEffectiveSettings(s)).origin).toBe("default");
  });

  it("gives up on a request that does not answer", async () => {
    const s = new MemoryStorage();
    const hang = (async (_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    const r = await settingsCore(s, URL_UNDER_TEST).refresh({ fetch: hang, now: () => 2, force: true, timeoutMs: 20 });
    expect(r.kind).toBe("kept");
  });
});
