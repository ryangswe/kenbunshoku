// Scratch: a headless Firefox hover check of a Firefox dev build on the local test page (not committed).
//   node test/smoke/zz-ff-smoke.mjs --firefox <binary> --dist <firefox dev build> --video <clip> [--at 3.5] [--grid 12x7]
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { startServer } from "../manual/serve.mjs";

const { values } = parseArgs({
  options: {
    firefox: { type: "string" },
    video: { type: "string" },
    dist: { type: "string" },
    at: { type: "string", default: "3.5" },
    grid: { type: "string", default: "12x7" },
    wait: { type: "string", default: "60" },
    dwell: { type: "string", default: "450" },
  },
});
const { default: puppeteer } = await import("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer({ video: resolve(values.video), port: 0 });
const pageUrl = `http://127.0.0.1:${server.address().port}/`;
const chrome = !values.firefox.includes("firefox");
const browser = await puppeteer.launch(
  chrome
    ? { executablePath: values.firefox, headless: true, pipe: true, enableExtensions: [resolve(values.dist)], args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,1000"], defaultViewport: { width: 1360, height: 900 } }
    : { browser: "firefox", executablePath: values.firefox, headless: true, defaultViewport: { width: 1360, height: 900 }, extraPrefsFirefox: { "media.autoplay.default": 0, "dom.webgpu.enabled": true } },
);
const consoleLines = [];
try {
  const id = chrome ? "(loaded at launch)" : await browser.installExtension(resolve(values.dist));
  const page = await browser.newPage();
  page.on("console", (m) => consoleLines.push(`[page ${m.type()}] ${m.text()}`));
  await page.goto(pageUrl);
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, { timeout: 30_000 });
  const ua = await page.evaluate(() => navigator.userAgent);
  console.log(`browser: ${ua.match(/(Firefox|Chrome)\/[\d.]+/)?.[0]}; extension ${id}`);
  const at = Number(values.at);
  await page.evaluate(async (t) => {
    const v = document.querySelector("video");
    v.pause();
    v.currentTime = t;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  }, at);
  const rect = await page.evaluate(() => {
    const r = document.querySelector("video").getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const visible = () =>
    page.evaluate(() => {
      const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/tooltip.html"));
      return f && getComputedStyle(f).visibility === "visible" ? `${f.style.left},${f.style.top}` : null;
    });
  // First look: wiggle until a tooltip appears somewhere on a sweep, or the wait runs out.
  const started = Date.now();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  await page.mouse.move(cx, cy);
  const frames = await page.evaluate(() => [...document.querySelectorAll("iframe")].map((i) => i.src.split("/").pop()));
  console.log(`frames after the first move: ${frames.join(", ")}`);
  for (let i = 0; i < Number(values.wait) * 4; i += 1) {
    await page.mouse.move(cx + (i % 2 ? 3 : -3), cy, { steps: 2 });
    await sleep(250);
  }
  console.log(`wiggled ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const [cols, rows] = values.grid.split("x").map(Number);
  let hits = 0;
  const places = new Set();
  const turns = [];
  let unoutlined = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = rect.left + ((c + 0.5) / cols) * rect.width;
      const y = rect.top + ((r + 0.5) / rows) * rect.height;
      await page.mouse.move(x, y, { steps: 3 });
      await sleep(Number(values.dwell));
      const v = await visible();
      if (process.env.ZZ_TRACE) console.log(`G ${r},${c} t=${Date.now()} vis=${v ?? "-"}`);
      if (v) {
        hits += 1;
        places.add(v);
        const turn = await page.evaluate(() => {
          const o = document.querySelector("[data-kenbunshoku=outline]");
          return o && o.style.display === "block" ? o.style.transform || "none" : null;
        });
        if (turn && turn !== "none") {
          turns.push(`${r},${c}:${turn}`);
          if (process.env.ZZ_SHOT && turns.length === 1) await page.screenshot({ path: process.env.ZZ_SHOT });
        }
        if (turn === null) unoutlined += 1;
      }
    }
  }
  console.log(`grid points with a tooltip on show: ${hits} of ${cols * rows}; distinct tooltip places: ${places.size}`);
  console.log(`outline: turned at ${turns.length} of those points${turns.length ? ` (${turns.join(" ")})` : ""}; no outline at ${unoutlined}`);
  // Check 1 (outside review): a page script makes up a "shown" message from the compute frame, with
  // the right source and origin. The content script must ignore it (not trusted).
  await page.mouse.move(rect.left + 5, rect.top + rect.height - 5);
  await sleep(2500);
  const before = await visible();
  // From a script element: the page's own world, as a site's script would run.
  const forged = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = `(() => {
      try {
        const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/compute.html"));
        const origin = new URL(f.src).origin;
        const card = { cardId: "OP01-001", name: "Forged by the page", box: { x: 0.0, y: 0.9, width: 0.1, height: 0.1 }, others: [] };
        window.dispatchEvent(new MessageEvent("message", { source: f.contentWindow, origin, data: { kenbunshoku: 1, kind: "shown", card } }));
        document.documentElement.dataset.forged = "dispatched from " + origin.split(":")[0];
      } catch (error) {
        document.documentElement.dataset.forged = "the page could not make it: " + String(error).slice(0, 120);
      }
    })();`;
    document.head.append(script);
    return document.documentElement.dataset.forged;
  });
  await sleep(2500);
  console.log(`check 1: forged shown (${forged}): tooltip before ${before ?? "hidden"}, after ${(await visible()) ?? "hidden"}`);
  // Check 4: the page removes the compute frame; the next move makes a new one, and hovers go on.
  await page.evaluate(() => [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/compute.html"))?.remove());
  await page.mouse.move(cx, cy);
  await sleep(300);
  const remade = await page.evaluate(() => [...document.querySelectorAll("iframe")].filter((i) => i.src.endsWith("/compute.html")).length);
  let after = 0;
  for (let i = 0; i < Number(values.wait) * 4 && after === 0; i += 1) {
    await page.mouse.move(cx + (i % 2 ? 3 : -3), cy, { steps: 2 });
    await sleep(250);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      await page.mouse.move(rect.left + ((c + 0.5) / cols) * rect.width, rect.top + ((r + 0.5) / rows) * rect.height, { steps: 3 });
      await sleep(Number(values.dwell));
      if (await visible()) after += 1;
    }
  }
  console.log(`check 4: compute frames after the page removed it and the pointer moved: ${remade}; grid points with a tooltip after: ${after}`);
  for (const line of consoleLines.slice(0, process.env.ZZ_TRACE ? 100000 : 40)) console.log(line);
} finally {
  await browser.close();
  server.close();
}
