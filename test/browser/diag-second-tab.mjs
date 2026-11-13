// SPDX-License-Identifier: Apache-2.0
// A diagnostic, not a check: why a second tab's model loads late while the first tab is alive.
// Run by hover-browser.mjs when DIAG_ROUNDS is set. For each case it opens a new tab, moves the
// pointer over a card once, and records the time until the tab's model is ready, the CPU time
// each Chrome process used meanwhile (SystemInfo.getProcessInfo), the busiest threads (Linux
// only, from /proc), and whether the compute frame and its worker are cross-origin isolated.
import { readdirSync, readFileSync } from "node:fs";

const TICK_MS = 10; // Linux USER_HZ is 100 on the CI runners.

function readThreads(pids) {
  if (process.platform !== "linux") return null;
  const out = {};
  for (const pid of pids) {
    let type = "?";
    try {
      // Chrome rewrites its command line on Linux, so the arguments may be joined by spaces.
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split(/[\0 ]/);
      type = (args.find((a) => a.startsWith("--type="))?.slice(7) ?? "browser") + (args.includes("--extension-process") ? "+extension" : "");
      for (const tid of readdirSync(`/proc/${pid}/task`)) {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, "utf8");
        const close = stat.lastIndexOf(")");
        const comm = stat.slice(stat.indexOf("(") + 1, close);
        const f = stat.slice(close + 2).split(" ");
        out[`${pid}/${tid}`] = { pid, type, comm, ticks: Number(f[11]) + Number(f[12]) };
      }
    } catch {
      // The process or thread ended between reads.
    }
  }
  return out;
}

export async function diagSecondTab({ browser, rounds, getPage, setPage, openPage, video, pointOf, computeDebug, until, log }) {
  const cdp = await browser.target().createCDPSession();
  const procs = async () => {
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    return Object.fromEntries(processInfo.map((p) => [p.id, { type: p.type, cpuS: p.cpuTime }]));
  };
  const isolation = async (tab) => {
    const f = tab.frames().find((fr) => fr.url().startsWith("chrome-extension://") && fr.url().endsWith("/compute.html"));
    const frame = f ? await f.evaluate(() => ({ coi: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== "undefined", cores: navigator.hardwareConcurrency })).catch(() => null) : null;
    const workers = [];
    for (const t of browser.targets()) {
      if (t.type() !== "worker" || !t.url().startsWith("chrome-extension://")) continue;
      const w = await t.worker().catch(() => null);
      workers.push({ url: t.url().split("/").at(-1), coi: w ? await w.evaluate(() => self.crossOriginIsolated).catch(() => null) : null });
    }
    return { frame, workers };
  };
  const firstReady = async (page) => Boolean(await until(async () => ((await computeDebug(page))?.state === "ready" ? true : null), 30_000));

  const results = [];
  async function measure(label) {
    const p0 = await procs();
    const t0 = readThreads(Object.keys(p0));
    let watch = null;
    const tab = await openPage(browser, async (p) => {
      watch = await watchTab(browser, p);
    });
    await video.seek(tab, 2, false);
    const start = Date.now();
    watch.at("move (harness)", { swRunning: watch.swRunning() });
    const pt = await pointOf(tab, "B");
    await tab.mouse.move(pt.x, pt.y, { steps: 4 });
    const readyAt = await until(async () => ((await computeDebug(tab))?.state === "ready" ? Date.now() : null), 60_000, 100);
    const p1 = await procs();
    const t1 = readThreads(Object.keys(p1));
    const iso = await isolation(tab);
    const procMs = Object.entries(p1)
      .map(([id, p]) => ({ pid: Number(id), type: p.type, ms: Math.round((p.cpuS - (p0[id]?.cpuS ?? 0)) * 1000), new: !p0[id] }))
      .filter((p) => p.ms > 0)
      .sort((a, b) => b.ms - a.ms);
    const threads = t1
      ? Object.entries(t1)
          .map(([k, t]) => ({ pid: t.pid, type: t.type, thread: t.comm, ms: (t.ticks - (t0?.[k]?.ticks ?? 0)) * TICK_MS }))
          .filter((t) => t.ms > 0)
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 12)
      : null;
    const workerThreads = t1 ? Object.values(t1).filter((t) => /Worker/i.test(t.comm)).map((t) => `${t.pid}:${t.type}:${t.comm}`) : null;
    const steps = (await watch.stop(tab)).map((e) => ({ ...e, ms: e.ms - (start - watch.t0) }));
    const r = { label, readyMs: readyAt ? readyAt - start : null, wallMs: Date.now() - start, steps, procMs, threads, workerThreads, iso };
    results.push(r);
    log("diag", r);
    await tab.close();
  }

  async function ensureFirst(playing) {
    let page = getPage();
    if (!page) {
      page = await openPage(browser);
      setPage(page);
    }
    await page.bringToFront();
    await video.seek(page, 2, true);
    const ready = await firstReady(page);
    if (!playing) await page.evaluate(() => document.querySelector("video").pause());
    return ready;
  }

  const cases = ["alive-playing", "alive-paused", "closed"];
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < cases.length; i += 1) {
      const c = cases[(i + round) % cases.length];
      if (c === "closed") {
        const page = getPage();
        if (page) await page.close();
        setPage(null);
        await measure(`${c} #${round + 1}`);
      } else {
        const ready = await ensureFirst(c === "alive-playing");
        await measure(`${c} #${round + 1}${ready ? "" : " (first tab not ready)"}`);
      }
    }
  }
  await ensureFirst(true);
  const summary = {};
  for (const r of results) {
    const c = r.label.split(" ")[0];
    (summary[c] ??= []).push(r.readyMs);
  }
  log("diag-summary", summary);
  await cdp.detach().catch(() => {});
  return results;
}

/** Sample every Chrome thread's CPU time once a second until stopped; each sample lists the
 *  busiest threads in that second. Linux only (null elsewhere). */
export async function startSampler(browser, every = 1000) {
  if (process.platform !== "linux") return { stop: async () => null };
  const cdp = await browser.target().createCDPSession();
  const pids = async () => (await cdp.send("SystemInfo.getProcessInfo")).processInfo.map((p) => String(p.id));
  const start = Date.now();
  const samples = [];
  let prev = readThreads(await pids());
  let running = true;
  const loop = (async () => {
    while (running) {
      await new Promise((r) => setTimeout(r, every));
      const now = readThreads(await pids().catch(() => []));
      const top = Object.entries(now ?? {})
        .map(([k, t]) => ({ pid: t.pid, type: t.type, thread: t.comm, ms: (t.ticks - (prev?.[k]?.ticks ?? 0)) * TICK_MS }))
        .filter((t) => t.ms >= 50)
        .sort((x, y) => y.ms - x.ms)
        .slice(0, 6);
      samples.push({ at: Date.now() - start, totalMs: top.reduce((n, t) => n + t.ms, 0), top });
      prev = now;
    }
  })();
  return {
    async stop() {
      running = false;
      await loop;
      await cdp.detach().catch(() => {});
      return samples;
    },
  };
}

/** Watch a tab from before it navigates: the extension's content-script context, frames attached
 *  and navigated, new targets (a service worker started again shows here), and, in the page's
 *  own world, the first trusted pointer move and each iframe inserted and loaded. */
export async function watchTab(browser, page) {
  const t0 = Date.now();
  const events = [];
  const at = (name, extra = {}) => events.push({ ms: Date.now() - t0, name, ...extra });
  const cdp = await page.createCDPSession();
  cdp.on("Runtime.executionContextCreated", ({ context }) => {
    if (context.name?.includes("puppeteer")) return;
    if (context.auxData?.type === "isolated" || context.origin?.startsWith("chrome-extension://")) at("context created", { name: context.name, type: context.auxData?.type ?? null });
  });
  await cdp.send("Runtime.enable");
  page.on("frameattached", (f) => at("frame attached", { url: f.url().split("/").at(-1) }));
  page.on("framenavigated", (f) => {
    if (f !== page.mainFrame()) at("frame navigated", { url: f.url().split("/").at(-1) });
  });
  const onTarget = (t) => at("target created", { type: t.type(), url: t.url().split("/").at(-1) });
  browser.on("targetcreated", onTarget);
  await page.evaluateOnNewDocument(() => {
    const marks = (window.__diagMarks = []);
    const m = (name, extra = {}) => marks.push({ t: Date.now(), name, ...extra });
    addEventListener("pointermove", (e) => {
      if (e.isTrusted && !marks.some((x) => x.name === "first trusted pointermove")) m("first trusted pointermove");
    }, true);
    new MutationObserver((list) => {
      for (const r of list)
        for (const n of r.addedNodes)
          if (n.tagName === "IFRAME") {
            const src = String(n.src).split("/").at(-1);
            m("iframe inserted", { src });
            n.addEventListener("load", () => m("iframe load", { src }));
          }
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => m("DOMContentLoaded"));
    addEventListener("load", () => m("page load"));
  });
  const swRunning = () => browser.targets().some((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"));
  return {
    t0,
    at,
    swRunning,
    async stop(tab) {
      browser.off("targetcreated", onTarget);
      const marks = await tab.evaluate(() => window.__diagMarks ?? []).catch(() => []);
      for (const k of marks) events.push({ ms: k.t - t0, name: `page: ${k.name}`, ...(k.src ? { src: k.src } : {}) });
      await cdp.detach().catch(() => {});
      return events.sort((a, b) => a.ms - b.ms);
    },
  };
}

/** A Chrome trace of V8's wasm and compile events in every process, from now until stopped. The
 *  raw trace is written to `file`; the summary lists each event name (count, total time, first and
 *  last time, processes) and, one by one, the events about streaming, caching and whole-module
 *  compiles. Times are in ms on the event log's clock (`nowT`). */
export async function startTrace(browser, nowT) {
  const { createWriteStream } = await import("node:fs");
  const cdp = await browser.target().createCDPSession();
  await cdp.send("Tracing.start", {
    transferMode: "ReturnAsStream",
    traceConfig: { includedCategories: ["v8.wasm", "disabled-by-default-v8.wasm.detailed", "v8.compile", "disabled-by-default-v8.compile"], recordMode: "recordContinuously" },
  });
  await cdp.send("Tracing.recordClockSyncMarker", { syncId: "diag-start" });
  const syncT = nowT();
  return {
    async stop(file) {
      const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
      await cdp.send("Tracing.end");
      const { stream } = await done;
      const out = createWriteStream(file);
      let text = "";
      for (;;) {
        const { data, eof, base64Encoded } = await cdp.send("IO.read", { handle: stream, size: 1 << 20 });
        const chunk = base64Encoded ? Buffer.from(data, "base64").toString("utf8") : data;
        out.write(chunk);
        text += chunk;
        if (eof) break;
      }
      await cdp.send("IO.close", { handle: stream }).catch(() => {});
      out.end();
      await cdp.detach().catch(() => {});
      const parsed = JSON.parse(text);
      const events = Array.isArray(parsed) ? parsed : parsed.traceEvents ?? [];
      const sync = events.find((e) => e.name === "clock_sync" && e.args?.sync_id === "diag-start");
      const toT = (ts) => (sync ? Math.round(syncT + (ts - sync.ts) / 1000) : null);
      const byName = {};
      const notable = [];
      const open = new Map();
      for (const e of events) {
        if (!e.name || e.ph === "M" || e.name === "clock_sync") continue;
        let dur = e.dur ?? null;
        if (e.ph === "B") {
          open.set(`${e.pid}/${e.tid}/${e.name}`, e.ts);
          continue;
        }
        if (e.ph === "E") {
          const b = open.get(`${e.pid}/${e.tid}/${e.name}`);
          if (b === undefined) continue;
          dur = e.ts - b;
          e.ts = b;
        }
        const n = (byName[e.name] ??= { count: 0, ms: 0, first: null, last: null, pids: [] });
        n.count += 1;
        n.ms += (dur ?? 0) / 1000;
        const t = toT(e.ts);
        n.first = n.first === null ? t : Math.min(n.first, t);
        n.last = n.last === null ? t : Math.max(n.last, t);
        if (!n.pids.includes(e.pid)) n.pids.push(e.pid);
        if (/stream|cache|serial|deserial|compile(?!function)|instantiate|tier|module/i.test(e.name) && !/CompileFunction|ExecuteCompilationUnits/i.test(e.name))
          notable.push({ t, name: e.name, pid: e.pid, tid: e.tid, ms: dur === null ? null : Math.round(dur / 1000), ...(e.args && Object.keys(e.args).length ? { args: e.args } : {}) });
      }
      for (const n of Object.values(byName)) n.ms = Math.round(n.ms);
      notable.sort((a, b) => a.t - b.t);
      return { synced: Boolean(sync), events: events.length, byName, notable: notable.slice(0, 400) };
    },
  };
}
