// SPDX-License-Identifier: Apache-2.0
// A headless smoke check of the remote release pointer (cdn/SETTINGS.md, "release"), against a
// local stand-in for the CDN. It is not part of `npm test`, and it never opens a video site.
//
//   npm run build -- --dev --release <bundled release folder> --out <dist>
//   npm install --no-save puppeteer-core
//   node test/smoke/remote-smoke.mjs --chrome <Chrome for Testing or Chromium> --dist <dist> --video <clip>
//        --remote <remote release folder> [--geo-dir <the remote release's packed index>]
//        [--expect-id <card id only the remote release has>] [--at 2 --at 5]
//
// The stand-in is an HTTPS server on 127.0.0.1 with a throwaway self-signed certificate; Chrome is
// told to send cdn.<host> there (--host-resolver-rules) and to accept the certificate. It serves
// config.json with the pointer of each case, the remote release's folder, and logs every request,
// so what the browser really downloaded (not what it read from its cache) is counted.
//
// Cases, each in a fresh browser profile:
//   remote-ok     the pointer names the remote release: it loads; with the same models as the
//                 bundled release only the bank, identity groups and catalog are downloaded; the
//                 card only the remote release has gets its tooltip (facts channel).
//                 Then the cache: a second tab of the same site downloads nothing again; a tab of
//                 another site (localhost) shows whether the browser keeps one cache per site.
//   sha-mismatch  the pointer's sha256 is wrong: the bundled release, reason doc-sha, recorded.
//   unreachable   the release's folder drops the connection: the bundled release, not recorded.
//   version       the pointer asks for a newer extension: the bundled release, nothing fetched.
// With --geo-dir (the geometric stage, Kenbunshoku):
//   geo-ok        the pointer names the release's geometric.json and its index: the frame checks it
//                 (rule G2) and the worker gets the remote index (stage ready where WebGPU runs).
//   geo-shape     geometric.json names an index outside /vision/geo/: the remote release, stage off.
//   remote-ok then has no `geometric` in its pointer: the remote release, stage off (geo-absent).
// Shown card ids are read from the compute frame's `shown` messages to the page (the page can see
// them; their facts travel on the extension-only channel).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { startServer } from "../manual/serve.mjs";

const { values } = parseArgs({
  options: {
    chrome: { type: "string" },
    dist: { type: "string" },
    video: { type: "string" },
    remote: { type: "string" },
    "expect-id": { type: "string", multiple: true, default: [] },
    "geo-dir": { type: "string" },
    at: { type: "string", multiple: true, default: ["2"] },
    grid: { type: "string", default: "12x7" },
    only: { type: "string" },
  },
});
if (!values.chrome || !values.dist || !values.video || !values.remote) {
  console.error("usage: node test/smoke/remote-smoke.mjs --chrome <Chrome for Testing> --dist <dist> --video <clip> --remote <release folder>");
  process.exit(2);
}
const { default: puppeteer } = await import("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = resolve(values.dist);
const remoteDir = resolve(values.remote);
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf-8"));
const cdnHost = new URL(JSON.parse(readFileSync(new URL("../../kenbunshoku.config.json", import.meta.url), "utf-8")).settingsUrl).host;
const liveConfig = JSON.parse(readFileSync(new URL("../../cdn/config.json", import.meta.url), "utf-8"));
const remoteDoc = readFileSync(join(remoteDir, "release.json"));
const remoteId = JSON.parse(remoteDoc).id;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const remoteRefs = (() => {
  const d = JSON.parse(remoteDoc);
  return [d.bank.path, d.identity.groups.path, d.catalog.path];
})();
// The remote release's index (flat folder) and its geometric settings file, as publish-release would
// put them: the bundled settings with index.path on the CDN.
const geo = values["geo-dir"]
  ? (() => {
      const dir = resolve(values["geo-dir"]);
      const manifest = readFileSync(join(dir, "manifest.json"));
      const folder = JSON.parse(manifest).source.sha256.slice(0, 16);
      const settings = JSON.parse(readFileSync(new URL("../../data/geometric.json", import.meta.url), "utf-8"));
      const good = Buffer.from(JSON.stringify({ ...settings, index: { ...settings.index, path: `https://${cdnHost}/vision/geo/${folder}/manifest.json` } }));
      const bad = Buffer.from(JSON.stringify({ ...settings, index: { ...settings.index, path: `https://${cdnHost}/vision/releases/${folder}/manifest.json` } }));
      return { dir, folder, manifestSha: sha(manifest), good, bad };
    })()
  : null;

// ------------------------------------------------------------------ the CDN stand-in
const certDir = mkdtempSync(join(tmpdir(), "remote-smoke-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem"),
  "-subj", `/CN=${cdnHost}`, "-addext", `subjectAltName=DNS:${cdnHost}`], { stdio: "ignore" });
// Trusted by its key's hash (--ignore-certificate-errors-spki-list), so Chrome treats it as a valid
// certificate and keeps the responses in its HTTP cache (it caches nothing from a connection with a
// certificate error).
const spki = execFileSync("sh", ["-c", `openssl x509 -pubkey -noout -in "${join(certDir, "cert.pem")}" | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`], { encoding: "utf-8" }).trim();
const state = { config: liveConfig, log: [], dropId: "deaddeaddeaddead", geometric: null };
const cdn = createServer({ key: readFileSync(join(certDir, "key.pem")), cert: readFileSync(join(certDir, "cert.pem")) }, (req, res) => {
  const path = new URL(req.url ?? "/", `https://${cdnHost}`).pathname;
  const send = (status, body, type, cache) => {
    state.log.push({ path, status, bytes: body.length });
    res.writeHead(status, { "content-type": type, "cache-control": cache, "access-control-allow-origin": "*" }).end(body);
  };
  if (path === "/config.json") return send(200, Buffer.from(JSON.stringify(state.config)), "application/json", "public, max-age=300");
  const m = /^\/vision\/releases\/([0-9a-f]{16})\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(path);
  if (m && m[1] === state.dropId) {
    state.log.push({ path, status: "dropped", bytes: 0 });
    return req.socket.destroy();
  }
  if (m && m[1] === remoteId && m[2] === "geometric.json" && state.geometric) {
    return send(200, state.geometric, "application/json", "public, max-age=31536000, immutable");
  }
  const g = geo && /^\/vision\/geo\/([0-9a-f]{16})\/(manifest\.json|shard-[0-9]+\.bin)$/.exec(path);
  if (g && g[1] === geo.folder) {
    const body = readFileSync(join(geo.dir, g[2]));
    return send(200, body, g[2].endsWith(".json") ? "application/json" : "application/octet-stream", "public, max-age=31536000, immutable");
  }
  if (m && m[1] === remoteId) {
    try {
      const body = readFileSync(join(remoteDir, m[2]));
      return send(200, body, m[2].endsWith(".onnx") ? "application/octet-stream" : "application/json", "public, max-age=31536000, immutable");
    } catch {}
  }
  send(404, Buffer.from("not here"), "text/plain", "no-store");
});
await new Promise((r) => cdn.listen(0, "127.0.0.1", r));
const cdnPort = cdn.address().port;
const page = await startServer({ video: resolve(values.video), port: 0 });
const pagePort = page.address().port;

const pointer = (over = {}) => ({ id: remoteId, path: `vision/releases/${remoteId}/release.json`, sha256: sha(remoteDoc), minimumExtensionVersion: manifest.version, ...over });
const geoPointer = (bytes) => ({ path: `vision/releases/${remoteId}/geometric.json`, sha256: sha(bytes), manifestSha256: geo.manifestSha });
const cases = [
  { name: "remote-ok", pointer: pointer(), expect: { source: "remote", reason: "ok", geo: geo ? "geo-absent" : null }, cacheSplit: true },
  ...(geo
    ? [
        { name: "geo-ok", pointer: pointer({ geometric: geoPointer(geo.good) }), geometric: geo.good, expect: { source: "remote", reason: "ok", geo: "ok" } },
        { name: "geo-shape", pointer: pointer({ geometric: geoPointer(geo.bad) }), geometric: geo.bad, expect: { source: "remote", reason: "ok", geo: "geo-shape" } },
      ]
    : []),
  { name: "sha-mismatch", pointer: pointer({ sha256: "0".repeat(64) }), expect: { source: "bundled", reason: "doc-sha" }, skip: true },
  { name: "unreachable", pointer: { ...pointer(), id: state.dropId, path: `vision/releases/${state.dropId}/release.json` }, expect: { source: "bundled", reason: "unreachable" } },
  { name: "version", pointer: pointer({ minimumExtensionVersion: "99.0.0" }), expect: { source: "bundled", reason: "version" } },
].filter((c) => !values.only || values.only.split(",").includes(c.name));

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};

try {
  for (const c of cases) {
    console.log(`\n== ${c.name}`);
    state.config = { ...liveConfig, release: c.pointer };
    state.geometric = c.geometric ?? null;
    state.log = [];
    const browser = await puppeteer.launch({
      executablePath: values.chrome,
      headless: true,
      pipe: true,
      enableExtensions: [dist],
      args: ["--autoplay-policy=no-user-gesture-required", `--host-resolver-rules=MAP ${cdnHost} 127.0.0.1:${cdnPort}`, `--ignore-certificate-errors-spki-list=${spki}`, "--window-size=1400,1000"],
      defaultViewport: { width: 1360, height: 900 },
    });
    try {
      const origin = await extensionOrigin(browser);
      await waitForSettings(browser, origin, c.pointer);
      await turnOn(browser, origin);
      const tab = await browser.newPage();
      // The compute frame's `shown` messages reach the page window: record the ids and release ids.
      await tab.evaluateOnNewDocument(() => {
        window.__shown = [];
        window.addEventListener("message", (e) => {
          const card = e.data && e.data.card;
          if (e.data && e.data.kind === "shown" && card && typeof card.cardId === "string") window.__shown.push(`${card.cardId}@${card.releaseId ?? "bundled"}`);
        });
      });
      const consoleLines = [];
      tab.on("console", (m) => consoleLines.push(m.text()));
      const first = await hoverPage(tab, `http://127.0.0.1:${pagePort}/`);
      const d = first.compute?.release?.decision;
      console.log(`  decision: ${JSON.stringify(d)}`);
      console.log(`  named: ${[...first.names].join(", ") || "nothing"} (analyzed ${first.compute?.analyzed}, last frame error ${first.compute?.lastFrameError})`);
      console.log(`  shown ids: ${[...first.shown].join(", ") || "none"}`);
      console.log(`  geometric: reason ${first.compute?.geometricReason ?? "-"}, stage ${JSON.stringify(first.compute?.geometric ?? null)}`);
      if (c.expect.geo !== undefined && c.expect.geo !== null) check(first.compute?.geometricReason === c.expect.geo, `geometric reason ${c.expect.geo}`);
      if (c.expect.source === "remote") for (const id of values["expect-id"]) check(first.shown.has(`${id}@${remoteId}`), `${id} shown from the remote release`);
      if (c.expect.source === "bundled") for (const id of values["expect-id"]) check(![...first.shown].some((s) => s.startsWith(`${id}@`)), `${id} not shown (the bundled release lacks it)`);
      check(d && d.source === c.expect.source && d.reason.startsWith(c.expect.reason), `source=${c.expect.source} reason=${c.expect.reason}`);
      check(first.compute?.state === "ready", `recognition ready (${first.compute?.state})`);
      const releaseRequests = state.log.filter((l) => l.path.startsWith("/vision/releases/") && !l.path.endsWith("/geometric.json"));
      const geoRequests = state.log.filter((l) => l.path.startsWith("/vision/geo/") || l.path.endsWith("/geometric.json"));
      console.log(`  geometric requests: ${geoRequests.map((l) => `${l.path.split("/").slice(-2).join("/")} ${l.status}`).join("; ") || "none"}`);
      console.log(`  CDN requests: ${releaseRequests.map((l) => `${l.path.split("/").pop()} ${l.status} ${l.bytes}`).join("; ") || "none"}`);
      if (c.name === "remote-ok") {
        const files = releaseRequests.map((l) => l.path.split("/").pop()).sort();
        check(JSON.stringify(files) === JSON.stringify(["release.json", ...remoteRefs].sort()), "only release.json, bank, groups and catalog downloaded (models reused)");
        check(d?.reused === 2, `reused ${d?.reused}/5`);
        const line = consoleLines.find((l) => l.includes("release source="));
        check(Boolean(line) && !/127\.0\.0\.1|video|channel/.test(line), `one log line, no page data: ${line}`);
      }
      if (c.name === "version") check(releaseRequests.length === 0, "nothing fetched from the release folder");
      const stored = await storageOf(browser, origin);
      if (c.skip) check(stored.releaseSkip?.id === c.pointer.id && stored.releaseSkip?.reason === c.expect.reason, `skip-list entry: ${JSON.stringify(stored.releaseSkip)}`);
      else check(!stored.releaseSkip, `no skip-list entry (${JSON.stringify(stored.releaseSkip ?? null)})`);
      if (c.cacheSplit) {
        for (const [label, url] of [["same site, second tab", `http://127.0.0.1:${pagePort}/`], ["another site (localhost)", `http://localhost:${pagePort}/`]]) {
          const before = state.log.length;
          const t = await browser.newPage();
          const r = await hoverPage(t, url);
          const fetched = state.log.slice(before).filter((l) => l.path.startsWith("/vision/releases/"));
          const bytes = fetched.reduce((s, l) => s + l.bytes, 0);
          console.log(`  cache, ${label}: ${r.compute?.release?.decision?.source} ${r.compute?.release?.decision?.reason}; downloaded from the CDN again: ${fetched.length ? `${fetched.length} files, ${bytes} bytes` : "nothing"}`);
          await t.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  cdn.close();
  page.close();
}
console.log(`\nremote smoke: ${failures ? `${failures} failure(s)` : "all checks passed"}`);
process.exit(failures ? 1 : 0);

// ------------------------------------------------------------------ helpers

async function extensionOrigin(browser) {
  const target = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15_000 });
  return target.url().split("/").slice(0, 3).join("/");
}

async function storageOf(browser, origin) {
  const p = await browser.newPage();
  await p.goto(`${origin}/popup.html`);
  const s = await p.evaluate(() => chrome.storage.local.get(null));
  await p.close();
  return s;
}

/** The background fetches config.json at start-up; wait until the copy in effect has this pointer. */
async function waitForSettings(browser, origin, want) {
  for (let i = 0; i < 40; i += 1) {
    const s = await storageOf(browser, origin);
    const canon = (o) => JSON.stringify(o, o && typeof o === "object" ? Object.keys(o).sort() : undefined);
    if (canon(s["settings.lastGood"]?.raw?.release) === canon(want)) return;
    await sleep(250);
  }
  const s = await storageOf(browser, origin);
  throw new Error(`the background did not store the case's config.json (CDN saw: ${JSON.stringify(state.log)}; stored: ${JSON.stringify(s["settings.lastGood"] ?? null).slice(0, 300)}; last attempt ${s["settings.lastAttemptAt"]})`);
}

async function turnOn(browser, origin) {
  const p = await browser.newPage();
  await p.goto(`${origin}/popup.html`);
  await p.evaluate(() => chrome.storage.local.set({ "channel:local:/": Date.now() }));
  await p.close();
}

async function frameOf(tab, name) {
  return tab.frames().find((f) => f.url().startsWith("chrome-extension://") && f.url().endsWith(name)) ?? null;
}

async function computeState(tab) {
  const frame = await frameOf(tab, "/compute.html");
  return frame ? frame.evaluate(() => window.__kenbunshokuDebug?.() ?? null).catch(() => null) : null;
}

async function tooltipName(tab) {
  const visible = await tab.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/tooltip.html"));
    return Boolean(f && getComputedStyle(f).visibility === "visible");
  });
  if (!visible) return null;
  const frame = await frameOf(tab, "/tooltip.html");
  return frame
    ? frame.evaluate(() => (document.getElementById("art").hidden ? document.getElementById("pill").textContent : document.getElementById("img").alt)).catch(() => null)
    : null;
}

/** Open the test page, hover a grid at each --at time, and return the names shown and the compute frame's state. */
async function hoverPage(tab, url) {
  await tab.goto(url);
  await tab.waitForFunction(() => document.querySelector("video")?.readyState >= 2, { timeout: 30_000 });
  const [cols, rows] = values.grid.split("x").map(Number);
  const names = new Set();
  for (const at of values.at.map(Number)) {
    await tab.evaluate(async (t) => {
      const v = document.querySelector("video");
      v.pause();
      v.currentTime = t;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    }, at);
    const rect = await tab.evaluate(() => {
      const r = document.querySelector("video").getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    await tab.mouse.move(cx, cy);
    for (let i = 0; i < 80; i += 1) {
      await tab.mouse.move(cx + (i % 2 ? 3 : -3), cy, { steps: 2 });
      await sleep(250);
      const s = await computeState(tab);
      if (s?.analyzed || s?.state === "failed") break;
    }
    for (let r = 0; r < rows; r += 1) {
      for (let col = 0; col < cols; col += 1) {
        await tab.mouse.move(rect.left + ((col + 0.5) / cols) * rect.width, rect.top + ((r + 0.5) / rows) * rect.height, { steps: 3 });
        await sleep(400);
        const name = await tooltipName(tab);
        if (name) names.add(name);
      }
    }
  }
  const shown = new Set(await tab.evaluate(() => window.__shown ?? []));
  return { names, shown, compute: await computeState(tab) };
}
