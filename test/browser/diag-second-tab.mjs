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
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
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
    const tab = await openPage(browser);
    await video.seek(tab, 2, false);
    const start = Date.now();
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
    const r = { label, readyMs: readyAt ? readyAt - start : null, wallMs: Date.now() - start, procMs, threads, workerThreads, iso };
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
