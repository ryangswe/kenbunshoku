// SPDX-License-Identifier: Apache-2.0
// The geometric stage under a remote release (src/release/geometric.ts): the pointer's
// `geometric` field, rule G2's checks (flat and series index folders, and nothing else), which
// bundled request a fallback uses, and the frame's use of those requests.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { startComputeFrame } from "../src/compute/frame.js";
import type { LoadRequest } from "../src/compute/load-request.js";
import {
  checkRemoteGeometric,
  chosenBeforeFetch,
  fallbackRequest,
  GEO_MANIFEST_PATH,
  type GeometricField,
  geometricLine,
  parseGeometricPointer,
} from "../src/release/geometric.js";
import { SITE_ORIGIN } from "./helpers/fork.js";

const ID = "0123456789abcdef";
const SETTINGS_URL = "https://cdn.example.test/config.json";
const GEO_URL = `https://cdn.example.test/vision/releases/${ID}/geometric.json`;
const MANIFEST_SHA = "b".repeat(64);
const sha = (bytes: ArrayBuffer | Uint8Array): string => createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => sha(bytes);

/** A geometric.json naming `indexPath`, and a pointer field pinning its bytes. */
function fixture(indexPath: unknown, extra: Record<string, unknown> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify({ seed: 0, index: { path: indexPath, sha256: "c".repeat(64) }, ...extra }));
  const release = { id: ID, geometric: { path: `vision/releases/${ID}/geometric.json`, sha256: sha(bytes), manifestSha256: MANIFEST_SHA } };
  return { bytes, release, field: parseGeometricPointer(release) };
}

function server(body: Uint8Array | null, status = 200) {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (body === null) throw new TypeError("offline");
    return new Response(body as BodyInit, { status });
  }) as typeof fetch;
  return { fetchFn, requests };
}

const check = (field: GeometricField, fetchFn: typeof fetch, stageOn = true) => checkRemoteGeometric(field, stageOn, { fetch: fetchFn, sha256Hex, settingsUrl: SETTINGS_URL });

describe("parseGeometricPointer (G1)", () => {
  it("reads a well-formed field", () => {
    const { field } = fixture("https://cdn.example.test/vision/geo/cd676903704f456d/manifest.json");
    expect(field.kind).toBe("pointer");
  });
  it("is absent when the release has none", () => {
    expect(parseGeometricPointer({ id: ID })).toEqual({ kind: "absent" });
    expect(parseGeometricPointer({ id: ID, geometric: null })).toEqual({ kind: "absent" });
    expect(parseGeometricPointer(null)).toEqual({ kind: "absent" });
  });
  it.each([
    ["geometric", "x"],
    ["path", { path: `vision/releases/${"f".repeat(16)}/geometric.json`, sha256: "a".repeat(64), manifestSha256: MANIFEST_SHA }],
    ["path", { path: `vision/releases/${ID}/../geometric.json`, sha256: "a".repeat(64), manifestSha256: MANIFEST_SHA }],
    ["path", { path: `https://cdn.example.test/vision/releases/${ID}/geometric.json`, sha256: "a".repeat(64), manifestSha256: MANIFEST_SHA }],
    ["sha256", { path: `vision/releases/${ID}/geometric.json`, sha256: "A".repeat(64), manifestSha256: MANIFEST_SHA }],
    ["manifestSha256", { path: `vision/releases/${ID}/geometric.json`, sha256: "a".repeat(64) }],
  ])("is malformed (%s)", (key, geometric) => {
    expect(parseGeometricPointer({ id: ID, geometric })).toEqual({ kind: "malformed", key });
  });
});

describe("checkRemoteGeometric (G1, G2)", () => {
  it("accepts a flat index folder (manifest.json): the request's URL and pinned manifest", async () => {
    const f = fixture("https://cdn.example.test/vision/geo/cd676903704f456d/manifest.json");
    const s = server(f.bytes);
    expect(await check(f.field, s.fetchFn)).toEqual({ ok: true, url: GEO_URL, manifestSha256: MANIFEST_SHA });
    // From the settings host only, with no cookies or referrer.
    expect(s.requests).toHaveLength(1);
    expect(s.requests[0]!.url).toBe(GEO_URL);
    expect(s.requests[0]!.init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("accepts a series index folder (manifest-<16 hex>.json), and a path relative to geometric.json", async () => {
    const f = fixture("https://cdn.example.test/vision/geo/0123456789abcdef/manifest-89abcdef01234567.json");
    expect((await check(f.field, server(f.bytes).fetchFn)).ok).toBe(true);
    const r = fixture("../../geo/0123456789abcdef/manifest.json");
    expect((await check(r.field, server(r.bytes).fetchFn)).ok).toBe(true);
  });

  it.each([
    ["a third manifest shape", "https://cdn.example.test/vision/geo/0123456789abcdef/manifest-x.json"],
    ["a manifest outside /vision/geo/", "https://cdn.example.test/vision/releases/0123456789abcdef/manifest.json"],
    ["a folder that is not 16 hex", "https://cdn.example.test/vision/geo/series-one/manifest.json"],
    ["a nested folder", "https://cdn.example.test/vision/geo/0123456789abcdef/x/manifest.json"],
    ["another host", "https://optcgapi.com/vision/geo/0123456789abcdef/manifest.json"],
    ["plain http", "http://cdn.example.test/vision/geo/0123456789abcdef/manifest.json"],
    ["a query", "https://cdn.example.test/vision/geo/0123456789abcdef/manifest.json?v=1"],
    ["no path", 7],
  ])("turns the stage off for %s (geo-shape)", async (_, path) => {
    const f = fixture(path);
    expect(await check(f.field, server(f.bytes).fetchFn)).toEqual({ ok: false, reason: "geo-shape" });
  });

  it("turns the stage off for bytes that are not the pinned ones, or not JSON", async () => {
    const f = fixture("https://cdn.example.test/vision/geo/0123456789abcdef/manifest.json");
    expect(await check(f.field, server(new TextEncoder().encode("{}")).fetchFn)).toEqual({ ok: false, reason: "geo-sha" });
    const junk = new TextEncoder().encode("not json");
    const field: GeometricField = { kind: "pointer", geometric: { path: `vision/releases/${ID}/geometric.json`, sha256: sha(junk), manifestSha256: MANIFEST_SHA } };
    expect(await check(field, server(junk).fetchFn)).toEqual({ ok: false, reason: "geo-shape" });
  });

  it("turns the stage off when the file cannot be fetched", async () => {
    const f = fixture("https://cdn.example.test/vision/geo/0123456789abcdef/manifest.json");
    expect(await check(f.field, server(null).fetchFn)).toEqual({ ok: false, reason: "geo-unreachable" });
    expect(await check(f.field, server(f.bytes, 404).fetchFn)).toEqual({ ok: false, reason: "geo-unreachable" });
  });

  it("fetches nothing when the settings turn the stage off, or the pointer has no usable field", async () => {
    const f = fixture("https://cdn.example.test/vision/geo/0123456789abcdef/manifest.json");
    const s = server(f.bytes);
    expect(await check(f.field, s.fetchFn, false)).toEqual({ ok: false, reason: "geo-setting" });
    expect(await check({ kind: "absent" }, s.fetchFn)).toEqual({ ok: false, reason: "geo-absent" });
    expect(await check({ kind: "malformed", key: "sha256" }, s.fetchFn)).toEqual({ ok: false, reason: "geo-malformed:sha256" });
    expect(s.requests).toHaveLength(0);
  });

  it("the path rule is exactly the union of Addenda 3 and 4", () => {
    expect(GEO_MANIFEST_PATH.test("/vision/geo/cd676903704f456d/manifest.json")).toBe(true);
    expect(GEO_MANIFEST_PATH.test("/vision/geo/cd676903704f456d/manifest-0123456789abcdef.json")).toBe(true);
    expect(GEO_MANIFEST_PATH.test("/vision/geo/cd676903704f456d/manifest-0123456789ABCDEF.json")).toBe(false);
    expect(GEO_MANIFEST_PATH.test("/vision/geo/cd676903704f456d/shard-0.bin")).toBe(false);
  });

  it("logs the decision without page, video or card", () => {
    expect(geometricLine("Kenbunshoku", ID, { ok: false, reason: "geo-sha" })).toBe(`[Kenbunshoku] geometric source=off reason=geo-sha pointer=${ID}`);
    expect(geometricLine("Kenbunshoku", ID, { ok: true, url: GEO_URL, manifestSha256: MANIFEST_SHA })).toBe(`[Kenbunshoku] geometric source=remote reason=ok pointer=${ID} manifest=${"b".repeat(16)}`);
  });
});

describe("which bundled request a page uses", () => {
  const BUNDLED_PIN = "d".repeat(64);
  const bundled: LoadRequest = { kind: "load", releaseUrl: "chrome-extension://x/release/release.json", wasmPaths: "w/", geometricUrl: "chrome-extension://x/data/geometric.json", geometricManifestSha256: BUNDLED_PIN };
  const pointer = (manifestSha256: string): GeometricField => ({ kind: "pointer", geometric: { path: `vision/releases/${ID}/geometric.json`, sha256: "a".repeat(64), manifestSha256 } });

  it("rules 1-5 (nothing fetched) keep the bundled request, stage included", () => {
    for (const reason of ["absent", "version", "same-as-bundled", "malformed:id", "skipped:doc-sha"]) expect(chosenBeforeFetch(reason)).toBe(true);
    for (const reason of ["unreachable", "http-404", "doc-sha", "doc-shape", "unreachable:bank.json", "file-sha:catalog.json", "catalog-unreadable", "unexpected:x"]) expect(chosenBeforeFetch(reason)).toBe(false);
  });

  it("a fallback from a remote release loads the bundled release with the stage off (the remote index stays cached)", () => {
    const plain = fallbackRequest(bundled, pointer(MANIFEST_SHA));
    expect(plain).toEqual({ kind: "load", releaseUrl: bundled.releaseUrl, wasmPaths: "w/" });
    expect(fallbackRequest(bundled, { kind: "absent" })).toEqual(plain);
  });

  it("unless the pointer's index is the bundled one", () => {
    expect(fallbackRequest(bundled, pointer(BUNDLED_PIN))).toBe(bundled);
  });
});

describe("the compute frame with those requests", () => {
  const plain: LoadRequest = { kind: "load", releaseUrl: "chrome-extension://x/release/release.json" };
  const full: LoadRequest = { ...plain, geometricUrl: "chrome-extension://x/data/geometric.json", geometricManifestSha256: "d".repeat(64) };
  const remote: LoadRequest = { kind: "load", releaseUrl: "release.json", files: {}, geometricUrl: GEO_URL, geometricManifestSha256: MANIFEST_SHA };
  const P = { id: ID, path: `vision/releases/${ID}/release.json`, sha256: "a".repeat(64), minimumExtensionVersion: "0.2.0", maximumExtensionVersion: null };

  function start(choice: unknown) {
    const workers: Array<{ onmessage: ((e: MessageEvent) => void) | null; onerror: ((e: ErrorEvent) => void) | null; posted: unknown[] }> = [];
    const geo: string[] = [];
    const frame = startComputeFrame({
      win: { parent: { postMessage: () => undefined }, addEventListener: () => undefined },
      framed: true,
      parentOrigin: SITE_ORIGIN,
      dev: false,
      createWorker: () => {
        const w = { onmessage: null, onerror: null, posted: [] as unknown[], postMessage(m: unknown) { this.posted.push(m); }, terminate() {} };
        workers.push(w);
        return w as never;
      },
      loadRequest: full,
      now: () => 0,
      chooseRelease: async () => choice as never,
      onGeometricStatus: (s) => void geo.push(`${s.state}:${s.reason}`),
    })!;
    return { frame, workers, geo };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const status = (id: string | null, ok = true) => ({ data: { kind: "release-status", ok, error: ok ? null : "the bank does not match", cards: [], release: id ? { id, recognizer: { ep: "wasm" }, detector: { ep: "wasm" }, hoverMaxAgeMs: 2000, analysisWidth: { min: 720, max: 1920 } } : null } }) as MessageEvent;

  it("a remote release is loaded with its own stage request", async () => {
    const t = start({ source: "remote", pointer: P, request: remote, fallback: plain, facts: {}, reused: 2, downloaded: 1, ms: 1 });
    await flush();
    expect(t.workers[0]!.posted[0]).toBe(remote);
  });

  it("the worker refusing it: the bundled release, by the choice's fallback request", async () => {
    const t = start({ source: "remote", pointer: P, request: remote, fallback: plain, facts: {}, reused: 2, downloaded: 1, ms: 1 });
    await flush();
    t.workers[0]!.onmessage?.(status(null, false));
    expect(t.workers[1]!.posted[0]).toBe(plain);
    expect(t.frame.release.source).toBe("bundled");
  });

  it("a bundled choice carries its own request (a fallback before the worker); without one, the full bundled request", async () => {
    const a = start({ source: "bundled", reason: "unreachable", pointer: P, downloaded: 0, ms: 1, request: plain });
    await flush();
    expect(a.workers[0]!.posted[0]).toBe(plain);
    const b = start({ source: "bundled", reason: "absent", pointer: null, downloaded: 0, ms: 1 });
    await flush();
    expect(b.workers[0]!.posted[0]).toBe(full);
  });

  it("a remote worker that fails after loading restarts once on the bundled release, stage off", async () => {
    const t = start({ source: "remote", pointer: P, request: remote, fallback: plain, facts: {}, reused: 2, downloaded: 1, ms: 1 });
    await flush();
    t.workers[0]!.onmessage?.(status(ID));
    expect(t.frame.release.source).toBe("remote");
    t.workers[0]!.onerror?.({ message: "boom" } as ErrorEvent);
    expect(t.workers[1]!.posted[0]).toEqual(plain);
    expect(t.frame.release).toMatchObject({ source: "bundled", reason: "worker-restart" });
    expect(t.geo).toContain("off:worker-restarted");
  });
});
