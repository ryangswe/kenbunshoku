// Scratch (Kenbunshoku lead, not committed): idle unload in a real build, headless.
// Build with a short idle time: npm run build -- --release R --dev --idle-unload-ms 20000 --out D
// Pauses the clip on a card, hovers it, leaves the video until both frames are gone, then hovers
// the same card again. Records the time to the tooltip each time, when the frames went, and the
// summed phys_footprint per process kind (macOS `footprint`) at each step.
//   node test/smoke/zz-idle.mjs --browser <chrome> --dist D --video <clip> --x 0.908 --y 0.542 --cycles 2 --out f.json
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { startServer } from "../manual/serve.mjs";

const { values } = parseArgs({
  options: {
    browser: { type: "string" },
    video: { type: "string" },
    dist: { type: "string" },
    at: { type: "string", default: "3.5" },
    x: { type: "string" },
    y: { type: "string" },
    cycles: { type: "string", default: "2" },
    out: { type: "string" },
  },
});
const { default: puppeteer } = await import("puppeteer-core");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer({ video: resolve(values.video), port: 0 });
const browser = await puppeteer.launch({
  executablePath: values.browser,
  headless: true,
  pipe: true,
  enableExtensions: [resolve(values.dist)],
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,1000"],
  defaultViewport: { width: 1360, height: 900 },
});

function processes(rootPid) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf-8" })
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }));
  const tree = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) if (!tree.has(r.pid) && tree.has(r.ppid)) (tree.add(r.pid), (grew = true));
  }
  return rows.filter((r) => tree.has(r.pid)).map((r) => {
    const type = /--type=(\S+)/.exec(r.args)?.[1] ?? "browser";
    const kind = type === "browser" ? "browser" : type === "gpu-process" ? "gpu" : type === "renderer" ? (r.args.includes("--extension-process") ? "extension renderer" : "page renderer") : "utility";
    return { pid: r.pid, kind };
  });
}
function footprintMb(pid) {
  try {
    const m = /Footprint:\s*([\d.]+)\s*(KB|MB|GB)/i.exec(execFileSync("footprint", [String(pid)], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }));
    if (!m) return 0;
    const v = Number(m[1]);
    return m[2].toUpperCase() === "GB" ? v * 1024 : m[2].toUpperCase() === "KB" ? v / 1024 : v;
  } catch {
    return 0;
  }
}
function snapshot(rootPid) {
  const byKind = {};
  for (const p of processes(rootPid)) {
    const k = (byKind[p.kind] ??= { processes: 0, mb: 0 });
    k.processes += 1;
    k.mb += footprintMb(p.pid);
  }
  for (const k of Object.values(byKind)) k.mb = Math.round(k.mb);
  return { total: Object.values(byKind).reduce((a, k) => a + k.mb, 0), byKind };
}

const result = { dist: values.dist, steps: [] };
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, { timeout: 30_000 });
  await page.evaluate(async (t) => {
    const v = document.querySelector("video");
    v.muted = true;
    v.pause();
    v.currentTime = t;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
  }, Number(values.at));
  const rect = await page.evaluate(() => {
    const v = document.querySelector("video");
    const r = v.getBoundingClientRect();
    // The picture inside the element (object-fit: contain).
    const scale = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
    const w = v.videoWidth * scale;
    const h = v.videoHeight * scale;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, bottom: r.bottom };
  });
  const card = { x: rect.left + Number(values.x) * rect.width, y: rect.top + Number(values.y) * rect.height };
  const away = { x: 20, y: Math.min(895, rect.bottom + 40) };
  const rootPid = browser.process().pid;
  const counts = () => page.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")];
    return { compute: f.filter((i) => i.src.endsWith("/compute.html")).length, tooltip: f.filter((i) => i.src.endsWith("/tooltip.html")).length };
  });
  const visible = () => page.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")].find((i) => i.src.endsWith("/tooltip.html"));
    return Boolean(f && getComputedStyle(f).visibility === "visible");
  });
  const geo = async () => {
    const compute = page.frames().find((fr) => fr.url().endsWith("/compute.html"));
    const d = compute ? await compute.evaluate(() => globalThis.__kenbunshokuDebug?.() ?? null).catch(() => null) : null;
    return d ? (d.geometric?.state ?? d.geometric ?? null) : null;
  };
  const step = async (name, extra = {}) => {
    const s = { name, frames: await counts(), geometric: await geo(), memory: snapshot(rootPid), ...extra };
    result.steps.push(s);
    console.log(name, JSON.stringify({ geometric: s.geometric, total: s.memory.total, ext: s.memory.byKind["extension renderer"]?.mb, gpu: s.memory.byKind.gpu?.mb, browser: s.memory.byKind.browser?.mb, ...extra }));
  };
  /** Hover the card with small real moves until the tooltip shows; ms from the first move. */
  const hover = async (limitMs) => {
    const t0 = performance.now();
    for (let i = 0; performance.now() - t0 < limitMs; i += 1) {
      await page.mouse.move(card.x + (i % 2 ? 2 : -2), card.y);
      if (await visible()) return Math.round(performance.now() - t0);
      await sleep(100);
    }
    return null;
  };
  await page.mouse.move(away.x, away.y);
  await sleep(2000);
  await step("before any hover");
  const first = await hover(90_000);
  await sleep(3000);
  await step("first hover +3 s", { tooltipMs: first });
  await sleep(12_000);
  await step("first hover +15 s");
  await sleep(15_000);
  await step("first hover +30 s");
  for (let c = 1; c <= Number(values.cycles); c += 1) {
    await page.mouse.move(away.x, away.y);
    const left = performance.now();
    let goneMs = null;
    while (performance.now() - left < 120_000) {
      const f = await counts();
      if (f.compute === 0 && f.tooltip === 0) {
        goneMs = Math.round(performance.now() - left);
        break;
      }
      await sleep(250);
    }
    await sleep(3000);
    await step(`cycle ${c}: unloaded`, { goneAfterLeavingMs: goneMs });
    const again = await hover(60_000);
    await sleep(3000);
    await step(`cycle ${c}: again +3 s`, { tooltipMs: again });
    await sleep(12_000);
    await step(`cycle ${c}: again +15 s`);
    await sleep(15_000);
    await step(`cycle ${c}: again +30 s`);
  }
  if (values.out) writeFileSync(values.out, JSON.stringify(result, null, 1));
} finally {
  await browser.close();
  server.close();
}
