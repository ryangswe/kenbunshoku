// SPDX-License-Identifier: Apache-2.0
// The hover browser test: the real extension, loaded unpacked in headless Chrome for Testing, on a
// local page that plays a clip rendered at run time from official card pictures. It asserts the
// hover behaviors below and fails (exit 1) when one breaks. It is not part of `npm test`; CI runs
// it in its own job (.github/workflows/tests.yml, "Hover browser test").
//
//   npm run build -- --dev --release <release folder> --out dist
//   npm run build -- --dev --release <release folder> --idle-unload-ms 6000 --out dist-idle
//   npm install --no-save --prefix <dir> puppeteer-core     (or set PUPPETEER_CORE_DIR to <dir>)
//   node test/browser/hover-browser.mjs --chrome <Chrome for Testing> --release <release folder>
//        --art <folder for the card pictures named below> [--fetch-art] [--dist dist]
//        [--dist-idle dist-idle] [--out <folder for the report and logs>] [--only <check id,...>]
//
// ffmpeg (with libvpx) and openssl must be on the PATH.
//
// What runs where. The page is http://127.0.0.1:<port>/ (test/manual/serve.mjs) with a VP8 clip
// rendered by ffmpeg from the pictures in --art (scenes below). The settings host is a local HTTPS
// stand-in with a throwaway certificate that Chrome trusts by its key's hash. Chrome resolves the
// settings host to it and every other host to nothing (--host-resolver-rules), and writes a NetLog
// of every request any of its processes made: the page, the extension's frames, its workers and
// its background. A request that leaves 127.0.0.1 fails the test.
//
// Recognition is real (the release's own models, on WebAssembly or WebGPU, whichever the browser
// offers); the clip is synthetic. The geometric stage is turned off by the test's settings file,
// because CI runners have no accelerated WebGPU.
//
// Each check has a provisional clause id (the hover spec's ids replace them). An expected failure
// is listed in EXPECTED_FAIL with the clause, the old value, the intended value and the task that
// removes it. A setup failure, a timeout of the whole run, a crash or a network violation is never
// an expected failure. A listed check that passes is reported as an unexpected pass and fails the
// run, so the list is reviewed.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:https";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { startServer } from "../manual/serve.mjs";

// ------------------------------------------------------------------ the product (change this block)
const PRODUCT = {
  name: "Kenbunshoku",
  /** The product's config file: the settings host is read from its settingsUrl. */
  config: new URL("../../kenbunshoku.config.json", import.meta.url),
  /** The dev builds' debug global in the compute frame: { state, analyzed, ... }. */
  debugGlobal: "__kenbunshokuDebug",
  /** Where the settings file puts card pictures, relative to the settings host. */
  artPath: (art) => `/art/${art}`,
  /** The storage keys of the popup's switches. */
  keys: { enabled: "enabled", keepCard: "keepCard" },
  /** The cards of the clip: catalog ids, each with its picture file named in the release catalog. */
  cards: { A: "OP01-001", B: "OP05-060", C: "ST01-012", D: "OP03-122" },
  /** Card width in the 1280x720 clip, in pixels; the height follows the picture. */
  cardWidth: 158,
};

// The clip: 20 s at 15 frames a second, looping. Each card's place, and when it is on show.
//   A  the whole clip; D is laid on top of it from 8 s (a card covering the hovered one)
//   B  the whole clip
//   C  until 12 s, then picked up (a card gone from under the pointer)
const CLIP = { width: 1280, height: 720, fps: 15, seconds: 20 };
const PLACES = {
  A: { x: 140, y: 250 },
  B: { x: 430, y: 250 },
  C: { x: 720, y: 250, until: 12 },
  D: { x: 152, y: 262, from: 8 },
};

/** Checks expected to fail on this build, each until the named task changes the behavior. */
const EXPECTED_FAIL = {
  "switch-on-after-idle-reloads": {
    clause: "HS-ENABLE-AFTER-IDLE (provisional)",
    old: "after an idle unload, switching card hovers off and on while the video plays makes no frame until the pointer moves",
    intended: "the frames are made again at once",
    clearedBy: "kenbunshoku#44 (or T9)",
  },
};

// ------------------------------------------------------------------ arguments
const { values } = parseArgs({
  options: {
    chrome: { type: "string" },
    release: { type: "string" },
    art: { type: "string" },
    dist: { type: "string", default: fileURLToPath(new URL("../../dist", import.meta.url)) },
    "dist-idle": { type: "string" },
    out: { type: "string" },
    only: { type: "string" },
    "fetch-art": { type: "boolean", default: false },
    headful: { type: "boolean", default: false },
  },
});
if (!values.chrome || !values.release || !values.art) {
  console.error("usage: node test/browser/hover-browser.mjs --chrome <Chrome for Testing> --release <release folder> --art <card pictures> [--dist dist] [--dist-idle dist-idle] [--out folder]");
  process.exit(2);
}
const puppeteerDir = process.env.PUPPETEER_CORE_DIR;
// puppeteer-core is not a dependency of this repository: it is installed beside it (PUPPETEER_CORE_DIR)
// or into it with --no-save.
const puppeteerModule = await import(puppeteerDir ? createRequire(join(resolve(puppeteerDir), "index.js")).resolve("puppeteer-core") : "puppeteer-core");
const puppeteer = puppeteerModule.default?.launch ? puppeteerModule.default : puppeteerModule;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = values.only ? new Set(values.only.split(",")) : null;
const out = resolve(values.out ?? mkdtempSync(join(tmpdir(), "hover-browser-out-")));
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "hover-browser-"));
const startedAt = Date.now();
const events = [];
const log = (kind, detail = {}) => {
  const line = { t: Date.now() - startedAt, kind, ...detail };
  events.push(line);
  console.log(`${String(line.t).padStart(6)} ${kind} ${Object.keys(detail).length ? JSON.stringify(detail) : ""}`);
};

// ------------------------------------------------------------------ fixtures
const productConfig = JSON.parse(readFileSync(PRODUCT.config, "utf-8"));
const cdnHost = new URL(productConfig.settingsUrl).host;
const catalog = JSON.parse(readFileSync(join(resolve(values.release), "catalog.json"), "utf-8"));
const byId = new Map((catalog.cards ?? catalog).map((c) => [c.id, c]));
// --fetch-art: download the pictures that are missing from the settings host, before the browser
// starts (official card art is never kept in this repository).
mkdirSync(resolve(values.art), { recursive: true });
const cards = {};
for (const [slot, id] of Object.entries(PRODUCT.cards)) {
  const card = byId.get(id);
  if (!card) throw new Error(`setup: ${id} is not in the release's catalog`);
  const file = join(resolve(values.art), card.art);
  if (!existsSync(file) && values["fetch-art"]) {
    const response = await fetch(`https://${cdnHost}${PRODUCT.artPath(card.art)}`);
    if (!response.ok) throw new Error(`setup: ${id}'s picture: HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  if (!existsSync(file)) throw new Error(`setup: no picture ${file} for ${id} (add --fetch-art)`);
  cards[slot] = { id, name: card.name, art: card.art, file };
}

/** The clip, rendered with ffmpeg: VP8 in WebM (Chrome for Testing plays no H.264). */
function renderClip() {
  const clip = join(work, "clip.webm");
  const slots = Object.keys(PLACES);
  const inputs = slots.flatMap((s) => ["-loop", "1", "-i", cards[s].file]);
  const scaled = slots.map((s, i) => `[${i + 1}]scale=${PRODUCT.cardWidth}:-1[${s}]`);
  let last = "bg";
  const layered = slots.map((s, i) => {
    const p = PLACES[s];
    const when = p.from !== undefined ? `:enable='gte(t,${p.from})'` : p.until !== undefined ? `:enable='lt(t,${p.until})'` : "";
    const next = i === slots.length - 1 ? "v" : `l${i}`;
    const step = `[${last}][${s}]overlay=${p.x}:${p.y}${when}:shortest=1[${next}]`;
    last = next;
    return step;
  });
  const graph = [`[0]noise=alls=10:allf=t[bg]`, ...scaled, ...layered].join(";");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=0x1d4a2e:s=${CLIP.width}x${CLIP.height}:r=${CLIP.fps}:d=${CLIP.seconds}`, ...inputs,
    "-filter_complex", graph, "-map", "[v]", "-t", String(CLIP.seconds), "-c:v", "libvpx", "-b:v", "2M", "-an", clip]);
  return clip;
}

/** The card's box in the clip, in clip pixels. */
function box(slot) {
  const p = PLACES[slot];
  const ratio = 88 / 63;
  return { x: p.x, y: p.y, w: PRODUCT.cardWidth, h: Math.round(PRODUCT.cardWidth * ratio) };
}

/** The local stand-in for the settings host: the settings file and the card pictures. */
function startStandIn() {
  const certDir = join(work, "cert");
  mkdirSync(certDir);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem"),
    "-subj", `/CN=${cdnHost}`, "-addext", `subjectAltName=DNS:${cdnHost}`], { stdio: "ignore" });
  const spki = execFileSync("sh", ["-c", `openssl x509 -pubkey -noout -in "${join(certDir, "cert.pem")}" | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`], { encoding: "utf-8" }).trim();
  // No release pointer (the bundled release only), no other picture host, no update notice, and
  // the geometric stage off.
  const settings = {
    schemaVersion: 1,
    updatedAt: "2026-11-13T00:00:00Z",
    namesOnly: false,
    primary: { id: "cdn", template: `https://${cdnHost}${PRODUCT.artPath("{art}")}` },
    fallbacks: [],
    geometric: false,
  };
  const art = new Map(Object.values(cards).map((c) => [PRODUCT.artPath(c.art), readFileSync(c.file)]));
  const requests = [];
  const server = createServer({ key: readFileSync(join(certDir, "key.pem")), cert: readFileSync(join(certDir, "cert.pem")) }, (req, res) => {
    const path = new URL(req.url ?? "/", `https://${cdnHost}`).pathname;
    const send = (status, body, type, cache) => {
      requests.push({ t: Date.now() - startedAt, path, status });
      res.writeHead(status, { "content-type": type, "cache-control": cache, "access-control-allow-origin": "*" }).end(body);
    };
    if (path === new URL(productConfig.settingsUrl).pathname) send(200, JSON.stringify(settings), "application/json", "no-cache");
    else if (art.has(path)) send(200, art.get(path), "image/jpeg", "public, max-age=86400");
    else send(404, "", "text/plain", "no-store");
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port, spki, requests })));
}

// ------------------------------------------------------------------ the browser
async function launch(dist, profile, netlog) {
  const browser = await puppeteer.launch({
    executablePath: values.chrome,
    headless: !values.headful,
    pipe: true,
    enableExtensions: [resolve(dist)],
    userDataDir: profile,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--host-resolver-rules=MAP ${cdnHost} 127.0.0.1:${standIn.port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
      `--ignore-certificate-errors-spki-list=${standIn.spki}`,
      `--log-net-log=${netlog}`,
      "--net-log-capture-mode=Default",
      // Chrome's own background traffic (sync, updates, sign-in), which is not the extension's.
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--no-first-run",
      "--window-size=1400,1000",
    ],
    defaultViewport: { width: 1360, height: 900 },
  });
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 20_000 });
  const extOrigin = sw.url().split("/").slice(0, 3).join("/");
  return { browser, extOrigin: { origin: extOrigin, worker: sw } };
}

/** Open the test page with the clip paused at the start; records the compute frame's `shown` messages. */
async function openPage(browser) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => log("page-error", { message: String(e.message ?? e) }));
  await page.evaluateOnNewDocument(() => {
    window.__shown = [];
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && typeof d === "object" && d.kind === "shown") window.__shown.push({ t: performance.now(), id: d.card?.cardId ?? null, held: d.card?.held === true });
    });
  });
  await page.goto(pageUrl);
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, { timeout: 30_000 });
  await page.evaluate(() => document.querySelector("video").pause());
  return page;
}

const video = {
  async seek(page, t, play) {
    await page.evaluate(async (t, play) => {
      const v = document.querySelector("video");
      v.pause();
      v.currentTime = t;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      if (play) await v.play();
    }, t, play);
  },
  time: (page) => page.evaluate(() => document.querySelector("video").currentTime),
  rect: (page) =>
    page.evaluate(() => {
      const r = document.querySelector("video").getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }),
};

/** The page point at the middle of a card of the clip. */
async function pointOf(page, slot) {
  const r = await video.rect(page);
  const b = box(slot);
  return { x: r.left + ((b.x + b.w / 2) / CLIP.width) * r.width, y: r.top + ((b.y + b.h / 2) / CLIP.height) * r.height };
}

async function extensionFrames(page) {
  return page.evaluate(() => [...document.querySelectorAll("iframe")].map((f) => f.src.split("/").at(-1)).filter((n) => n === "compute.html" || n === "tooltip.html"));
}

async function computeDebug(page) {
  const f = page.frames().find((fr) => fr.url().startsWith("chrome-extension://") && fr.url().endsWith("/compute.html"));
  if (!f) return null;
  return f.evaluate((g) => window[g]?.() ?? null, PRODUCT.debugGlobal).catch(() => null);
}

/** The tooltip as the viewer sees it: visible or not, the card's name, whether its picture shows. */
async function tooltip(page) {
  const visible = await page.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/tooltip.html"));
    return Boolean(f && getComputedStyle(f).visibility === "visible");
  });
  if (!visible) return { visible: false };
  const f = page.frames().find((fr) => fr.url().startsWith("chrome-extension://") && fr.url().endsWith("/tooltip.html"));
  const s = f
    ? await f
        .evaluate(() => {
          const img = document.getElementById("img");
          const art = document.getElementById("art");
          const pill = document.getElementById("pill");
          return { name: art.hidden ? pill.textContent : img.alt, art: !art.hidden && !art.classList.contains("loading") && img.complete && img.naturalWidth > 0 };
        })
        .catch(() => null)
    : null;
  return { visible: true, name: s?.name ?? null, art: s?.art ?? false };
}

async function outline(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-kenbunshoku="outline"]');
    if (!el || getComputedStyle(el).display === "none") return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** Poll until `probe` returns a truthy value or the time runs out; returns it, or null. */
async function until(probe, ms, every = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await probe();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

/** Set a stored setting as the popup does (chrome.storage.local), from the extension's background. */
async function setStored(browser, ext, key, value) {
  const worker = await ext.worker.worker();
  if (!worker) throw new Error("setup: the extension's background worker is not running");
  await worker.evaluate((k, v) => chrome.storage.local.set({ [k]: v }), key, value);
  await sleep(300);
}

// ------------------------------------------------------------------ the checks
const results = [];
function record(id, clause, ok, detail) {
  const xf = EXPECTED_FAIL[id];
  const outcome = ok ? (xf ? "unexpected-pass" : "pass") : xf ? "expected-fail" : "fail";
  results.push({ id, clause, outcome, detail, ...(xf ? { expected: xf } : {}) });
  log(`check ${outcome}`, { id, clause, ...detail });
}
const want = (id) => !only || only.has(id);

const clipPath = renderClip();
const server = await startServer({ video: clipPath, port: 0 });
const pageUrl = `http://127.0.0.1:${server.address().port}/`;
const standIn = await startStandIn();
log("setup", { clip: clipPath, page: pageUrl, standIn: standIn.port, cards: Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, `${c.id} ${c.name}`])) });

const netlogs = [];
const counts = {};
let fatal = null;
try {
  // ---------------- session 1: a fresh profile, the dev build
  {
    const netlog = join(out, "netlog-main.json");
    netlogs.push(netlog);
    const { browser, extOrigin } = await launch(values.dist, join(work, "profile-main"), netlog);
    try {
      const page = await openPage(browser);

      // Load at play, and no capture before a pointer.
      await sleep(1500);
      const beforePlay = await extensionFrames(page);
      await video.seek(page, 1, true);
      const atPlay = await until(async () => ((await extensionFrames(page)).length === 2 ? true : null), 10_000);
      const ready = await until(async () => ((await computeDebug(page))?.state === "ready" ? await computeDebug(page) : null), 60_000, 250);
      log("compute", { state: ready?.state ?? null, backend: ready?.backend ?? null });
      if (!ready) throw new Error("setup: the compute frame never became ready");
      await sleep(3000);
      const analyzedBeforePointer = (await computeDebug(page))?.analyzed ?? -1;
      if (want("frames-at-play")) record("frames-at-play", "HS-LOAD-AT-PLAY (provisional)", beforePlay.length === 0 && atPlay === true, { beforePlay, atPlay: Boolean(atPlay) });
      if (want("no-capture-before-pointer")) record("no-capture-before-pointer", "HS-AUTHORITY-POINTER (provisional)", analyzedBeforePointer === 0, { analyzedBeforePointer });

      // A named card's picture, and its outline.
      await video.seek(page, 2, false);
      const pB = await pointOf(page, "B");
      const a0 = (await computeDebug(page)).analyzed;
      const moved = Date.now();
      await page.mouse.move(pB.x, pB.y, { steps: 4 });
      const shownB = await until(async () => {
        const s = await tooltip(page);
        return s.visible && s.name === cards.B.name && s.art ? s : null;
      }, 15_000);
      const artMs = shownB ? Date.now() - moved : null;
      const a1 = (await computeDebug(page)).analyzed;
      counts.namedCard = { analyses: a1 - a0, artVisibleMs: artMs };
      if (want("art-visible")) record("art-visible", "HS-SHOW-ART (provisional)", Boolean(shownB), { want: cards.B.name, got: shownB ?? (await tooltip(page)), artMs, analyses: a1 - a0 });
      const ol = await outline(page);
      const vr = await video.rect(page);
      const bB = box("B");
      const cx = vr.left + ((bB.x + bB.w / 2) / CLIP.width) * vr.width;
      const cy = vr.top + ((bB.y + bB.h / 2) / CLIP.height) * vr.height;
      if (want("outline-shows")) record("outline-shows", "HS-OUTLINE (provisional)", Boolean(ol && cx > ol.left && cx < ol.left + ol.width && cy > ol.top && cy < ol.top + ol.height), { outline: ol });

      // Moving off the video clears the tooltip and the outline.
      await page.mouse.move(vr.left + vr.width / 2, vr.top + vr.height + 60, { steps: 4 });
      const cleared = await until(async () => (!(await tooltip(page)).visible && !(await outline(page)) ? true : null), 2000);
      if (want("move-off-clears")) record("move-off-clears", "HS-POINTER-LEAVE (provisional)", Boolean(cleared), {});

      // A card laid on top of the hovered one: the hovered card stays (the switch on), its outline
      // goes once the card is seen gone, and the tooltip stays.
      const covered = async () => {
        await video.seek(page, 5, true);
        const pA = await pointOf(page, "A");
        await page.mouse.move(pA.x, pA.y, { steps: 4 });
        const first = await until(async () => {
          const s = await tooltip(page);
          return s.visible && s.name ? s.name : null;
        }, 6000);
        const names = new Set();
        let heldWhileShown = false;
        while ((await video.time(page)) < 12.5) {
          const s = await tooltip(page);
          if (s.visible && s.name) names.add(s.name);
          if ((await video.time(page)) > 9 && s.visible && !(await outline(page))) heldWhileShown = true;
          await sleep(200);
        }
        const last = await tooltip(page);
        return { first, names: [...names], last: last.visible ? last.name : null, heldWhileShown };
      };
      const on = await covered();
      if (want("covered-kept")) record("covered-kept", "HS-READING-HOLD (provisional)", on.first === cards.A.name && on.last === cards.A.name && !on.names.includes(cards.D.name), on);
      if (want("held-outline-hides")) record("held-outline-hides", "HS-HELD-OUTLINE (provisional)", on.heldWhileShown && on.last === cards.A.name, on);

      // The switch off: the card on top replaces the hovered one with no pointer move.
      await page.mouse.move(vr.left + vr.width / 2, vr.top + vr.height + 60);
      await setStored(browser, extOrigin, PRODUCT.keys.keepCard, false);
      await page.bringToFront();
      await until(async () => ((await computeDebug(page))?.state === "ready" ? true : null), 30_000, 250);
      const off = await covered();
      if (want("switch-flips")) record("switch-flips", "HS-KEEP-CARD-SWITCH (provisional)", off.first === cards.A.name && off.last === cards.D.name, off);
      await page.mouse.move(vr.left + vr.width / 2, vr.top + vr.height + 60);
      await setStored(browser, extOrigin, PRODUCT.keys.keepCard, true);
      await page.bringToFront();

      // A page script's made-up pointer events: no frame, no capture.
      {
        const tab = await browser.newPage();
        await tab.goto(pageUrl);
        await tab.waitForFunction(() => document.querySelector("video")?.readyState >= 2, { timeout: 30_000 });
        await tab.evaluate(() => document.querySelector("video").pause());
        const p = await pointOf(tab, "B");
        await tab.evaluate(({ x, y }) => {
          for (let i = 0; i < 5; i += 1) window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + i, clientY: y, bubbles: true }));
        }, p);
        await sleep(1500);
        const fake = await extensionFrames(tab);
        await tab.mouse.move(p.x, p.y, { steps: 3 });
        const real = await until(async () => ((await extensionFrames(tab)).length === 2 ? true : null), 5000);
        if (want("fake-pointer-ignored")) record("fake-pointer-ignored", "HS-TRUSTED-INPUT (provisional)", fake.length === 0 && real === true, { framesAfterFake: fake, framesAfterReal: Boolean(real) });
        await tab.close();
      }

      // Off means off: no frames, and nothing captured or fetched for card hovers.
      await page.bringToFront();
      const reqBefore = standIn.requests.length;
      await setStored(browser, extOrigin, PRODUCT.keys.enabled, false);
      await page.bringToFront();
      const gone = await until(async () => ((await extensionFrames(page)).length === 0 ? true : null), 3000);
      await video.seek(page, 3, true);
      const pB2 = await pointOf(page, "B");
      await page.mouse.move(pB2.x, pB2.y, { steps: 4 });
      await sleep(2500);
      const framesOff = await extensionFrames(page);
      const fetchedOff = standIn.requests.slice(reqBefore).filter((r) => !r.path.endsWith(".json"));
      if (want("off-means-off")) record("off-means-off", "HS-OFF (provisional)", gone === true && framesOff.length === 0 && fetchedOff.length === 0, { framesOff, fetchedOff });
      await setStored(browser, extOrigin, PRODUCT.keys.enabled, true);
      await page.bringToFront();
      const back = await until(async () => ((await extensionFrames(page)).length === 2 ? true : null), 5000);
      if (want("on-while-playing-loads")) record("on-while-playing-loads", "HS-ENABLE (provisional)", back === true, {});

      // The cached reload: a new tab of the same page, and the same card again.
      {
        const before = standIn.requests.length;
        const tab = await openPage(browser);
        await video.seek(tab, 2, false);
        const p = await pointOf(tab, "B");
        await tab.mouse.move(p.x, p.y, { steps: 4 });
        const again = await until(async () => {
          const s = await tooltip(tab);
          return s.visible && s.name === cards.B.name && s.art ? s : null;
        }, 60_000);
        const fetched = standIn.requests.slice(before).filter((r) => r.path.startsWith(PRODUCT.artPath("")));
        counts.cachedReload = { artRequests: fetched.length };
        if (want("cached-reload")) record("cached-reload", "HS-CACHE (provisional)", Boolean(again) && fetched.length === 0, { shown: Boolean(again), artRequests: fetched.length });
        await tab.close();
      }
      await page.close();
    } finally {
      await browser.close();
    }
  }

  // ---------------- session 2: the idle unload, with a short idle time (a separate dev build)
  if (values["dist-idle"] && (want("idle-unloads") || want("loop-no-reload") || want("idle-reload-on-hover") || want("switch-on-after-idle-reloads"))) {
    const netlog = join(out, "netlog-idle.json");
    netlogs.push(netlog);
    const { browser, extOrigin } = await launch(values["dist-idle"], join(work, "profile-idle"), netlog);
    try {
      const page = await openPage(browser);
      const goIdle = async () => {
        await video.seek(page, 1, true);
        await until(async () => ((await extensionFrames(page)).length === 2 ? true : null), 10_000);
        await until(async () => ((await computeDebug(page))?.state === "ready" ? true : null), 60_000, 250);
        const p = await pointOf(page, "B");
        await page.mouse.move(p.x, p.y, { steps: 4 });
        await until(async () => ((await tooltip(page)).name === cards.B.name ? true : null), 15_000);
        const vr = await video.rect(page);
        await page.mouse.move(vr.left + vr.width / 2, vr.top + vr.height + 60, { steps: 4 });
        return until(async () => ((await extensionFrames(page)).length === 0 ? true : null), 30_000, 250);
      };
      const idle = await goIdle();
      if (want("idle-unloads")) record("idle-unloads", "HS-IDLE-UNLOAD (provisional)", idle === true, {});
      // The video playing again (a loop, a pause and play) makes nothing.
      await page.evaluate(async () => {
        const v = document.querySelector("video");
        v.pause();
        await v.play();
        v.currentTime = 19.5;
      });
      await sleep(3000);
      const afterLoop = await extensionFrames(page);
      if (want("loop-no-reload")) record("loop-no-reload", "HS-IDLE-NO-RELOAD (provisional)", afterLoop.length === 0, { afterLoop });
      // The next pointer move over the video makes them again, and names the card.
      const p = await pointOf(page, "B");
      await video.seek(page, 2, true);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      const reloaded = await until(async () => ((await tooltip(page)).name === cards.B.name ? true : null), 60_000);
      if (want("idle-reload-on-hover")) record("idle-reload-on-hover", "HS-IDLE-RELOAD (provisional)", reloaded === true, {});
      // Switched off and on after an idle unload, while the video plays.
      const idle2 = await goIdle();
      if (!idle2) throw new Error("setup: the second idle unload did not happen");
      await setStored(browser, extOrigin, PRODUCT.keys.enabled, false);
      await setStored(browser, extOrigin, PRODUCT.keys.enabled, true);
      await page.bringToFront();
      const atOnce = await until(async () => ((await extensionFrames(page)).length === 2 ? true : null), 5000);
      if (want("switch-on-after-idle-reloads")) record("switch-on-after-idle-reloads", EXPECTED_FAIL["switch-on-after-idle-reloads"].clause, atOnce === true, {});
      await page.close();
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  fatal = String(error?.stack ?? error);
  log("fatal", { error: fatal });
} finally {
  server.close();
  standIn.server.close();
}

// ------------------------------------------------------------------ the network scope
/** Every URL any process of Chrome requested, from its NetLog, with the request's initiator. */
function netlogRequests(file) {
  let text = readFileSync(file, "utf-8").trim();
  // A NetLog is complete JSON only after a clean exit; close an unfinished events list.
  if (!text.endsWith("}")) text = text.replace(/,?\s*$/, "") + "]}";
  const doc = JSON.parse(text);
  const types = Object.fromEntries(Object.entries(doc.constants.logEventTypes).map(([k, v]) => [v, k]));
  const urls = [];
  for (const e of doc.events) {
    const name = types[e.type];
    if ((name === "URL_REQUEST_START_JOB" || name === "REQUEST_ALIVE") && e.params?.url) urls.push({ url: e.params.url, initiator: e.params.initiator ?? null });
  }
  return urls;
}
const allowedScheme = /^(chrome-extension|data|blob):/;
const CHROME_OWN = /(^|\.)(google\.com|googleapis\.com|gstatic\.com|gvt1\.com)$/;
const violations = [];
const hostsSeen = new Map();
for (const file of netlogs) {
  if (!existsSync(file)) continue;
  for (const r of netlogRequests(file)) {
    if (allowedScheme.test(r.url)) continue;
    let host;
    try {
      host = new URL(r.url).host;
    } catch {
      continue;
    }
    hostsSeen.set(host, (hostsSeen.get(host) ?? 0) + 1);
    const local = host.startsWith("127.0.0.1:") || host === cdnHost;
    // Chrome's own background requests (sign-in, updates) start in the browser, with no origin as
    // their initiator, and resolve to nothing here. Any other request that leaves 127.0.0.1 is a
    // violation, whoever made it.
    const chromeOwn = (r.initiator === null || r.initiator === "not an origin") && CHROME_OWN.test(host.replace(/:\d+$/, ""));
    if (!local && !chromeOwn) violations.push(r);
  }
}
counts.standIn = standIn.requests.reduce((m, r) => ((m[`${r.status} ${r.path}`] = (m[`${r.status} ${r.path}`] ?? 0) + 1), m), {});
counts.hosts = Object.fromEntries(hostsSeen);

// ------------------------------------------------------------------ the report
const failed = results.filter((r) => r.outcome === "fail" || r.outcome === "unexpected-pass");
const report = {
  product: PRODUCT.name,
  passed: !fatal && violations.length === 0 && failed.length === 0 && results.length > 0,
  fatal,
  violations,
  results,
  counts,
  durationMs: Date.now() - startedAt,
};
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(out, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`\n${results.map((r) => `${r.outcome.padEnd(15)} ${r.id}`).join("\n")}`);
console.log(`network: ${violations.length} violation(s); hosts ${JSON.stringify(counts.hosts)}`);
console.log(`counts: ${JSON.stringify(counts)}`);
console.log(`${report.passed ? "PASS" : "FAIL"} in ${(report.durationMs / 1000).toFixed(0)} s; report ${join(out, "report.json")}`);
process.exit(report.passed ? 0 : 1);
