// SPDX-License-Identifier: Apache-2.0
// Interactive capture driver: Chrome for Testing with the Kenbunshoku build loaded, controlled
// over a local HTTP port so each step (load, look, hover, record) is decided by eye.
//
//   node scripts/driver.mjs --chrome <CfT binary> --ext <kenbunshoku/dist> [--port 8791]
//
// Endpoints (GET, query params): /goto?url  /shot?path  /move?x&y&ms  /click?x&y  /key?k
// /rec/start?name  /rec/stop  /tooltip  /button  /eval?js  /quit
// Recording writes captures/<name>/frames/<n>.jpg (CDP screencast), frames.jsonl (frame
// timestamps, seconds since epoch) and mouse.jsonl (every pointer position sent, same clock).
// The pointer is not in the screencast: the reel draws it from mouse.jsonl.

import http from "node:http";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";

const { values } = parseArgs({
  options: {
    chrome: { type: "string" },
    ext: { type: "string" },
    port: { type: "string", default: "8791" },
    profile: { type: "string", default: "captures/profile" },
  },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1920;
const H = 1080;

const browser = await puppeteer.launch({
  executablePath: values.chrome,
  headless: false,
  pipe: true,
  enableExtensions: [resolve(values.ext)],
  userDataDir: resolve(values.profile),
  args: [`--window-size=${W},${H + 140}`, "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 20_000 });
const extOrigin = sw.url().split("/").slice(0, 3).join("/");
await sleep(1500);
for (const p of await browser.pages()) if (!p.url().startsWith("about:blank")) await p.close().catch(() => {});
const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

let mouse = { x: W / 2, y: H / 2 };
let rec = null; // { dir, n, cdp }

function logMouse(kind = "move") {
  if (rec) appendFileSync(join(rec.dir, "mouse.jsonl"), JSON.stringify({ t: Date.now() / 1000, x: mouse.x, y: mouse.y, kind }) + "\n");
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function moveTo(x, y, ms) {
  const x0 = mouse.x;
  const y0 = mouse.y;
  const steps = Math.max(1, Math.round(ms / 16));
  const start = Date.now();
  for (let i = 1; i <= steps; i += 1) {
    const target = start + (i * ms) / steps;
    const k = easeInOut(i / steps);
    mouse = { x: x0 + (x - x0) * k, y: y0 + (y - y0) * k };
    await page.mouse.move(mouse.x, mouse.y);
    logMouse();
    const wait = target - Date.now();
    if (wait > 0) await sleep(wait);
  }
}

async function frameOf(name) {
  return page.frames().find((f) => f.url().startsWith("chrome-extension://") && f.url().endsWith(name)) ?? null;
}
async function tooltipState() {
  const box = await page.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/tooltip.html"));
    if (!f || getComputedStyle(f).visibility !== "visible") return null;
    const r = f.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (!box) return null;
  const frame = await frameOf("/tooltip.html");
  const st = frame
    ? await frame.evaluate(() => {
        const img = document.getElementById("img");
        const art = document.getElementById("art");
        const pill = document.getElementById("pill");
        return { name: art.hidden ? pill.textContent : img.alt, src: art.hidden ? null : img.currentSrc || img.src, loaded: !art.hidden && img.naturalWidth > 0 };
      }).catch(() => null)
    : null;
  return { box, ...st };
}

async function recStart(name) {
  const dir = resolve("captures", name);
  mkdirSync(join(dir, "frames"), { recursive: true });
  const cdp = await page.createCDPSession();
  rec = { dir, n: 0, cdp, name };
  cdp.on("Page.screencastFrame", async (ev) => {
    const n = rec?.n ?? 0;
    if (rec) {
      rec.n += 1;
      writeFileSync(join(dir, "frames", `${String(n).padStart(6, "0")}.jpg`), Buffer.from(ev.data, "base64"));
      appendFileSync(join(dir, "frames.jsonl"), JSON.stringify({ n, t: ev.metadata.timestamp }) + "\n");
    }
    await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  logMouse("start");
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return { dir };
}
async function recStop() {
  if (!rec) return { frames: 0 };
  const r = rec;
  await r.cdp.send("Page.stopScreencast").catch(() => {});
  logMouse("stop");
  rec = null;
  await r.cdp.detach().catch(() => {});
  return { frames: r.n, dir: r.dir };
}

const routes = {
  async goto(q) {
    await page.goto(q.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return { url: page.url() };
  },
  async shot(q) {
    await page.screenshot({ path: q.path, ...(q.clip ? { clip: JSON.parse(q.clip) } : {}) });
    return { path: q.path };
  },
  async move(q) {
    await moveTo(Number(q.x), Number(q.y), Number(q.ms ?? 600));
    return mouse;
  },
  async click(q) {
    if (q.x) await moveTo(Number(q.x), Number(q.y), Number(q.ms ?? 500));
    await page.mouse.down();
    logMouse("down");
    await sleep(90);
    await page.mouse.up();
    logMouse("up");
    return mouse;
  },
  async key(q) {
    if (q.mod) await page.keyboard.down(q.mod);
    await page.keyboard.press(q.k);
    if (q.mod) await page.keyboard.up(q.mod);
    return { ok: true };
  },
  async wait(q) {
    // Holds the pointer still, logging it, for q.ms.
    const end = Date.now() + Number(q.ms ?? 1000);
    while (Date.now() < end) {
      logMouse();
      await sleep(33);
    }
    return mouse;
  },
  async "rec/start"(q) {
    return recStart(q.name);
  },
  async "rec/stop"() {
    return recStop();
  },
  async tooltip() {
    return tooltipState();
  },
  async button() {
    return page.evaluate(() => {
      const h = document.querySelector("[data-kenbunshoku=button]");
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, display: getComputedStyle(h).display };
    });
  },
  async eval(q) {
    return page.evaluate(q.js);
  },
  async ext() {
    return { extOrigin };
  },
  async quit() {
    setTimeout(async () => {
      await browser.close();
      process.exit(0);
    }, 100);
    return { bye: true };
  },
};

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const q = Object.fromEntries(u.searchParams);
    const fn = routes[u.pathname.slice(1)];
    try {
      const out = fn ? await fn(q) : { error: "no route" };
      res.end(JSON.stringify(out) + "\n");
    } catch (e) {
      res.end(JSON.stringify({ error: String(e?.message ?? e) }) + "\n");
    }
  })
  .listen(Number(values.port), "127.0.0.1", () => console.log(`driver on ${values.port}, ext ${extOrigin}`));
