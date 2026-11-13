// @vitest-environment happy-dom
// SPDX-License-Identifier: Apache-2.0
// The content script in a page: trusted pointer events only, the frames it makes and remakes,
// the toolkit's capture control as wired here (the gate, the handshake, trusted frame messages),
// the tooltip's hide timer, leaving on a hidden tab, and teardown.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Agent, HIDE_DELAY_MS } from "../src/content/agent.js";
import { tag } from "../src/shared/messages.js";
import { PROTOCOL_VERSION } from "../vendor/cardvision-browser/page-capture.js";

const EXT = "chrome-extension://igfdjmpikcbplijnlpkligaafepgoaaa";

let video: HTMLVideoElement;
let agent: Agent;

/** What the stand-in video reports; tests change it. */
const media = { paused: false, readyState: 4, currentTime: 12.5 };

function makeVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  Object.defineProperties(v, {
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
    readyState: { get: () => media.readyState },
    currentTime: { get: () => media.currentTime },
    paused: { get: () => media.paused },
  });
  v.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 540, right: 960, bottom: 540, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(v);
  return v;
}

const frames = () => [...document.querySelectorAll("iframe")];
const compute = () => frames().find((f) => f.src.endsWith("/compute.html"));
const tooltip = () => frames().find((f) => f.src.endsWith("/tooltip.html"));
const outline = () => document.querySelector<HTMLElement>("[data-kenbunshoku=outline]");

/** Whether the stand-in pointer events are the viewer's own (the browser's isTrusted). */
let trustedEvents = true;

function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): void {
  const event = new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, ...init });
  Object.defineProperty(event, "isTrusted", { value: trustedEvents });
  document.dispatchEvent(event);
}

function move(x: number, y: number): void {
  pointer("pointermove", x, y);
}

/** The browser reports that a video started playing (`trusted` false: a page script made it up). */
function playing(v: HTMLVideoElement = video, trusted = true): void {
  const event = new Event("playing");
  Object.defineProperty(event, "isTrusted", { value: trusted });
  v.dispatchEvent(event);
}

/** Each frame's window, as a stand-in: nothing is loaded into the frames here. */
const windows = new WeakMap<HTMLIFrameElement, { sent: Array<Record<string, unknown>>; postMessage(m: Record<string, unknown>): void }>();
Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
  configurable: true,
  get(this: HTMLIFrameElement) {
    if (!windows.has(this)) {
      const sent: Array<Record<string, unknown>> = [];
      windows.set(this, { sent, postMessage: (m) => void sent.push(m) });
    }
    return windows.get(this);
  },
});

function message(data: unknown, origin: string, source: unknown, isTrusted = true): Event {
  const event = new Event("message");
  Object.defineProperties(event, { data: { value: data }, origin: { value: origin }, source: { value: source }, isTrusted: { value: isTrusted } });
  return event;
}

/** A message from one of the extension's frames, as the browser would deliver it. */
function fromFrame(frame: HTMLIFrameElement | undefined, data: object): void {
  window.dispatchEvent(message(tag(data), EXT, frame!.contentWindow));
}

const INSTANCE = "0123456789abcdef";

/** The compute frame says ready (the vendored contract version); the same instance again changes nothing. */
function computeReady(instance = INSTANCE): void {
  fromFrame(compute(), { kind: "ready", version: PROTOCOL_VERSION, instance });
}

/** The compute frame names a card, and the tooltip frame answers with its size for it (the
 *  frame is shown only once that size has come). */
function showCard(card: { cardId: string; name: string; box: { x: number; y: number; width: number; height: number }; rotation?: number; localWidth?: number; localHeight?: number }): void {
  computeReady();
  fromFrame(compute(), { kind: "shown", card });
  fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: card.cardId });
}

function spyOn(frame: HTMLIFrameElement | undefined): Array<Record<string, unknown>> {
  return windows.get(frame!)!.sent;
}

beforeEach(() => {
  Object.assign(media, { paused: false, readyState: 4, currentTime: 12.5 });
  agent?.stop();
  document.body.innerHTML = "";
  for (const f of frames()) f.remove();
  vi.stubGlobal("chrome", { runtime: { getURL: (path: string) => `${EXT}/${path}` } });
  vi.stubGlobal("location", new URL("http://127.0.0.1:8770/"));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 0));
  video = makeVideo();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

async function startAgent(trusted = true): Promise<Agent> {
  trustedEvents = trusted;
  const a = new Agent({ dev: true });
  a.start();
  a.setEnabled(true);
  await settle();
  return a;
}

describe("Agent", () => {
  it("ignores pointer events a page script made (a paused video, so nothing loads at play)", async () => {
    media.paused = true;
    agent = await startAgent(false);
    move(100, 100);
    expect(frames()).toEqual([]);
  });

  it("on a video that has not played, makes the two frames when the pointer first comes over the picture, and not before", async () => {
    media.paused = true;
    agent = await startAgent();
    move(100, 600);
    expect(frames()).toEqual([]);
    move(100, 100);
    expect(compute()).toBeDefined();
    expect(tooltip()).toBeDefined();
  });

  it("makes a frame again when the page removed it", async () => {
    agent = await startAgent();
    move(100, 100);
    const first = compute()!;
    first.remove();
    move(110, 100);
    expect(compute()).toBeDefined();
    expect(compute()).not.toBe(first);
  });

  it("refuses to capture when the pointer is not over the player", async () => {
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    move(100, 600);
    fromFrame(compute(), { kind: "capture", requestId: 7, analysisWidth: { min: 720, max: 1920 } });
    expect(sent.at(-1)).toMatchObject({ kind: "capture-failed", requestId: 7, reason: "not pointing at the video" });
  });

  it("tells the compute frame the pointer left when the tab is hidden", async () => {
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sent.at(-1)).toMatchObject({ kind: "leave" });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("shows the tooltip for a card, and hides it a moment after the card is gone", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    const card = { cardId: "OP01-001", name: "Roronoa Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    showCard(card);
    expect(tooltip()!.style.visibility).toBe("visible");
    fromFrame(compute(), { kind: "shown", card: null });
    expect(tooltip()!.style.visibility).toBe("visible");
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(tooltip()!.style.visibility).toBe("hidden");
  });

  it("lets the pointer through the tooltip", async () => {
    agent = await startAgent();
    move(100, 100);
    expect(tooltip()!.style.pointerEvents).toBe("none");
  });

  it("has no link: nothing it adds takes the pointer, and moves under the tooltip still reach the video", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    computeReady();
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(document.querySelector("[data-kenbunshoku=link]")).toBeNull();
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(tooltip()!.style.pointerEvents).toBe("none");
    expect(tooltip()!.tabIndex).toBe(-1);
    // Page styles for iframes and divs do not reach the extension's frames or the outline.
    expect(tooltip()!.getAttribute("style")).toMatch(/^all: ?initial/);
    expect(compute()!.getAttribute("style")).toMatch(/^all: ?initial/);
    expect(outline()!.getAttribute("style")).toMatch(/^all: ?initial/);
    // A move where the tooltip is drawn is still a move over the picture.
    const sent = spyOn(compute());
    const left = Number.parseFloat(tooltip()!.style.left);
    const top = Number.parseFloat(tooltip()!.style.top);
    move(left + 20, top + 20);
    expect(sent.filter((m) => m.kind === "pointer").at(-1)).toMatchObject({ x: (left + 20) / 960, y: (top + 20) / 540 });
  });

  it("sizes the frame to the tooltip: the card's picture with rounded corners, or a name pill", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    const card = { cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    showCard(card);
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card" });
    expect([tooltip()!.style.width, tooltip()!.style.height, tooltip()!.style.borderRadius]).toEqual(["320px", "448px", "14px"]);
    fromFrame(tooltip(), { kind: "size", width: 130, height: 33, shape: "pill" });
    expect([tooltip()!.style.width, tooltip()!.style.height, tooltip()!.style.borderRadius]).toEqual(["130px", "33px", "17px"]);
  });

  it("follows the card-size dial at once: the card on show is fitted again at the new size", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["320px", "448px"]);
    agent.setCardSize(130);
    expect([tooltip()!.style.width, tooltip()!.style.height, tooltip()!.style.borderRadius]).toEqual(["416px", "582px", "19px"]);
    agent.setCardSize(70);
    expect([tooltip()!.style.width, tooltip()!.style.height, tooltip()!.style.borderRadius]).toEqual(["224px", "314px", "10px"]);
    // A name pill is never scaled.
    fromFrame(tooltip(), { kind: "size", width: 130, height: 33, shape: "pill", cardId: "OP01-001" });
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["130px", "33px"]);
  });

  it("keeps a larger card inside a short window", async () => {
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 360 });
    try {
      agent = await startAgent();
      agent.setCardSize(130);
      move(100, 100);
      fromFrame(tooltip(), { kind: "ready" });
      showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.7, width: 0.1, height: 0.2 } });
      // The same room as at 100 %: 344 tall, so 416 x 582 becomes 245 x 342 (rounded down).
      expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["245px", "342px"]);
      const top = Number.parseFloat(tooltip()!.style.top);
      expect(top + 342).toBeLessThanOrEqual(360 - 8);
    } finally {
      if (height) Object.defineProperty(window, "innerHeight", height);
    }
  });

  it("scales the picture down, keeping its shape, when the window is short, and keeps it inside", async () => {
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 360 });
    try {
      agent = await startAgent();
      move(100, 100);
      fromFrame(tooltip(), { kind: "ready" });
      showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.7, width: 0.1, height: 0.2 } });
      fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card" });
      // 360 - 8 - 8 = 344 tall: 320 x 448 becomes 245 x 343 (rounded down, never over).
      expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["245px", "343px"]);
      const top = Number.parseFloat(tooltip()!.style.top);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + 343).toBeLessThanOrEqual(360 - 8);
    } finally {
      if (height) Object.defineProperty(window, "innerHeight", height);
    }
  });

  it("dates a paused live stream's frozen picture at the time it showed while playing", async () => {
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    video.dispatchEvent(new Event("timeupdate"));
    Object.assign(media, { paused: true, readyState: 1, currentTime: 0 });
    move(120, 100);
    expect(sent.filter((m) => m.kind === "pointer").at(-1)).toMatchObject({ mediaTime: 12.5 });
    // A picture is still taken from it (here the stand-in canvas has no 2D context).
    fromFrame(compute(), { kind: "capture", requestId: 3, analysisWidth: { min: 720, max: 1920 } });
    expect(sent.at(-1)).not.toMatchObject({ reason: "no picture" });
  });

  it("ignores tooltip messages it does not know (an old link message), and any from elsewhere", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const before = tooltip()!.style.cssText;
    fromFrame(tooltip(), { kind: "link", href: "https://example.org/" });
    fromFrame(compute(), { kind: "size", width: 900, height: 900, shape: "card" });
    window.dispatchEvent(message(tag({ kind: "size", width: 900, height: 900, shape: "card" }), "http://127.0.0.1:8770", window));
    expect(tooltip()!.style.cssText).toBe(before);
    expect(document.querySelector("[data-kenbunshoku=link]")).toBeNull();
  });

  it("forgets the time a video last played when its source changes", async () => {
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("emptied"));
    Object.assign(media, { paused: true, readyState: 1, currentTime: 0 });
    move(120, 100);
    expect(sent.filter((m) => m.kind === "pointer").at(-1)).toMatchObject({ mediaTime: 0 });
  });

  it("refuses a frozen picture that draws nothing", async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return {
        canvas: this,
        drawImage() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(30) }),
      } as unknown as CanvasRenderingContext2D;
    } as unknown as typeof getContext;
    try {
      agent = await startAgent();
      move(100, 100);
      const sent = spyOn(compute());
      computeReady();
      video.dispatchEvent(new Event("timeupdate"));
      Object.assign(media, { paused: true, readyState: 1, currentTime: 0 });
      move(120, 100);
      fromFrame(compute(), { kind: "capture", requestId: 4, analysisWidth: { min: 720, max: 1920 } });
      await new Promise((r) => setTimeout(r, 0));
      expect(sent.at(-1)).toMatchObject({ kind: "capture-failed", requestId: 4, reason: "no picture (the paused video draws nothing)" });
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext;
    }
  });

  it("sends one pointer message per trusted move, with no animation-frame throttle (owner, 10-29)", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 7);
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    sent.length = 0;
    move(130, 120);
    move(140, 120);
    move(150, 120);
    expect(sent.filter((m) => m.kind === "pointer")).toHaveLength(3);
  });

  it("ignores messages that do not come from its own frames", async () => {
    agent = await startAgent();
    move(100, 100);
    const shown = tag({ kind: "shown", card: { cardId: "X-1", name: "x", box: { x: 0, y: 0, width: 0.1, height: 0.1 } } });
    window.dispatchEvent(message(shown, "http://127.0.0.1:8770", window));
    window.dispatchEvent(message(shown, EXT, window));
    expect(tooltip()!.style.visibility).toBe("hidden");
  });

  it("is on for every video with nothing stored: no button, no per-channel switch", async () => {
    // No opt-in entry anywhere: the first move over the picture starts the session.
    agent = await startAgent();
    move(100, 100);
    expect(frames()).toHaveLength(2);
    expect(document.querySelector("[data-kenbunshoku=button]")).toBeNull();
  });

  it("stays idle on a paused video nobody points at: no frame for moves off the picture", async () => {
    media.paused = true;
    agent = await startAgent();
    move(100, 600);
    move(2000, 2000);
    expect(frames()).toEqual([]);
  });

  it("refuses a capture under a resting pointer once in-page navigation leaves the active page (S-G5)", async () => {
    vi.stubGlobal("location", new URL("https://www.youtube.com/watch?v=abc"));
    agent = new Agent({ dev: false });
    agent.start();
    agent.setEnabled(true);
    await settle();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    // The viewer goes to the home page; the video plays on in a miniplayer under the resting pointer.
    vi.stubGlobal("location", new URL("https://www.youtube.com/"));
    window.dispatchEvent(new Event("popstate"));
    fromFrame(compute(), { kind: "capture", requestId: 11, analysisWidth: { min: 720, max: 1920 } });
    await settle();
    // Refused before any picture is drawn: the pointer no longer counts, and the frame is told so.
    expect(sent.at(-1)).toMatchObject({ kind: "capture-failed", requestId: 11, reason: "not pointing at the video" });
    expect(sent.some((m) => m.kind === "leave")).toBe(true);
  });

  it("keeps answering after in-app navigation, pointer resting (no channel to look up)", async () => {
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    computeReady();
    vi.stubGlobal("location", new URL("http://127.0.0.1:8770/other"));
    window.dispatchEvent(new Event("popstate"));
    fromFrame(compute(), { kind: "capture", requestId: 9, analysisWidth: { min: 720, max: 1920 } });
    await settle();
    expect(frames()).toHaveLength(2);
    expect(sent.filter((m) => m.kind === "capture-failed" && /channel/.test(String(m.reason)))).toEqual([]);
  });

  it("hides the tooltip quickly, wherever the pointer is heading", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    const card = { cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    showCard(card);
    move(200, 200);
    move(240, 240);
    fromFrame(compute(), { kind: "shown", card: null });
    vi.advanceTimersByTime(HIDE_DELAY_MS - 10);
    move(270, 270);
    expect(tooltip()!.style.visibility).toBe("visible");
    vi.advanceTimersByTime(11);
    expect(tooltip()!.style.visibility).toBe("hidden");
  });

  it("outlines the card the tooltip names, on the same box, and hides it with the tooltip", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    const card = { cardId: "OP01-001", name: "Roronoa Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    showCard(card);
    const el = outline()!;
    expect(el.style.display).toBe("block");
    expect(el.style.pointerEvents).toBe("none");
    // The 960 x 540 video shows its 1920 x 1080 picture whole: the box in page pixels.
    expect([el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat)).toEqual([96, 54, 96, 108]);
    // Another card: the outline moves with the tooltip.
    showCard({ ...card, cardId: "OP01-002", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } });
    expect([el.style.left, el.style.top].map(parseFloat)).toEqual([480, 270]);
    // Gone: both stay for the quick hide, then go together.
    fromFrame(compute(), { kind: "shown", card: null });
    expect(el.style.display).toBe("block");
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(el.style.display).toBe("none");
  });

  it("turns the outline with a turned card, and follows a new outline of the same card", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    const sent = spyOn(tooltip());
    const cardMessages = () => sent.filter((m) => m.kind === "card").length;
    const card = { cardId: "OP01-001", name: "Roronoa Zoro", box: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 } };
    showCard({ ...card, rotation: 15, localWidth: 0.1, localHeight: 0.3 });
    const el = outline()!;
    expect(el.style.display).toBe("block");
    // The 960 x 540 picture: center (192, 162), sides 96 x 162 pixels.
    expect([el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat)).toEqual([144, 81, 96, 162]);
    expect(el.style.transform).toBe("rotate(15deg)");
    expect(cardMessages()).toBe(1);
    const place = [tooltip()!.style.left, tooltip()!.style.top];
    // The same card reported again with only its outline changed: the outline follows it, and the
    // tooltip is neither sent the card again nor moved.
    fromFrame(compute(), { kind: "shown", card: { ...card, rotation: -10, localWidth: 0.1, localHeight: 0.3 } });
    expect(el.style.transform).toBe("rotate(-10deg)");
    expect(cardMessages()).toBe(1);
    expect([tooltip()!.style.left, tooltip()!.style.top]).toEqual(place);
    // Upright again: the box, unturned.
    fromFrame(compute(), { kind: "shown", card });
    expect(el.style.transform).toBe("none");
    expect([el.style.left, el.style.top, el.style.width, el.style.height].map(parseFloat)).toEqual([96, 54, 192, 216]);
  });

  it("draws a malformed outline upright, and still shows the card", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "Roronoa Zoro", box: { x: 0.1, y: 0.1, width: 0.2, height: 0.4 }, rotation: 90, localWidth: 0.1, localHeight: 0.3 });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(outline()!.style.display).toBe("block");
    expect(outline()!.style.transform).toBe("none");
  });

  it("hides the outline with the tooltip when the pointer leaves the player", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect(outline()!.style.display).toBe("block");
    move(2000, 2000);
    // The compute frame answers a leave with no card.
    fromFrame(compute(), { kind: "shown", card: null });
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(outline()!.style.display).toBe("none");
  });

  it("outlines a paused live stream's frozen picture too", async () => {
    agent = await startAgent();
    Object.assign(media, { paused: true, readyState: 1 });
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(outline()!.style.display).toBe("block");
  });

  it("draws no outline for a box off the picture, while the tooltip still shows", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 1.2, y: 0.1, width: 0.1, height: 0.2 } });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(outline()!.style.display).toBe("none");
  });

  it("removes the outline when the extension is switched off, and brings it back when switched on", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect(outline()).not.toBeNull();
    agent.setEnabled(false);
    expect(outline()).toBeNull();
    agent.setEnabled(true);
    move(110, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect(outline()).not.toBeNull();
  });

  it("moves the outline and the tooltip with the page while a card is held (resize, scroll)", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const rect = () => ["left", "top", "width", "height"].map((k) => Number.parseFloat(outline()!.style[k as "left"]));
    expect(rect()).toEqual([96, 54, 96, 108]);
    const tooltipLeft = tooltip()!.style.left;
    // The player grows and moves (theater mode, a resized window): the next resize re-places both.
    video.getBoundingClientRect = () => ({ left: 100, top: 60, width: 1280, height: 720, right: 1380, bottom: 780, x: 100, y: 60, toJSON() {} }) as DOMRect;
    window.dispatchEvent(new Event("resize"));
    expect(rect()).toEqual([228, 132, 128, 144]);
    expect(tooltip()!.style.left).not.toBe(tooltipLeft);
    // Scrolling the page moves the player up: a scroll anywhere (capture) re-places them too.
    video.getBoundingClientRect = () => ({ left: 100, top: -40, width: 1280, height: 720, right: 1380, bottom: 680, x: 100, y: -40, toJSON() {} }) as DOMRect;
    document.body.dispatchEvent(new Event("scroll"));
    expect(rect()).toEqual([228, 32, 128, 144]);
  });

  it("re-places at most once per animation frame, and not at all with no card shown", async () => {
    const frames: Array<() => void> = [];
    const queue = (cb: FrameRequestCallback): number => (frames.push(() => cb(0)), frames.length);
    agent = await startAgent();
    move(100, 100);
    move(2000, 2000); // off the player: no card
    vi.stubGlobal("requestAnimationFrame", queue);
    window.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(0);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 0));
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    vi.stubGlobal("requestAnimationFrame", queue);
    for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event("resize"));
    expect(frames).toHaveLength(1);
  });

  it("re-mounts the tooltip and the outline inside the full-screen element, and places them there", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const player = document.createElement("div");
    document.body.appendChild(player);
    player.appendChild(video);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => player });
    try {
      document.dispatchEvent(new Event("fullscreenchange"));
      expect(tooltip()!.parentElement).toBe(player);
      expect(outline()!.parentElement).toBe(player);
      expect(document.querySelectorAll("[data-kenbunshoku=outline]")).toHaveLength(1);
      fromFrame(tooltip(), { kind: "ready" });
      showCard({ cardId: "OP01-002", name: "y", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } });
      expect(tooltip()!.style.visibility).toBe("visible");
      expect([outline()!.style.left, outline()!.style.top].map(parseFloat)).toEqual([480, 270]);
    } finally {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    }
  });

  it("keeps working across in-app navigation to another video", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const before = { compute: compute(), tooltip: tooltip() };
    vi.stubGlobal("location", new URL("http://127.0.0.1:8770/other"));
    window.dispatchEvent(new Event("popstate"));
    // Nothing is torn down.
    expect(compute()).toBe(before.compute);
    expect(tooltip()).toBe(before.tooltip);
    // The new video's first answer clears the old card; both go together.
    fromFrame(compute(), { kind: "shown", card: null });
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(outline()!.style.display).toBe("none");
    move(300, 300);
    showCard({ cardId: "OP01-002", name: "y", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect([outline()!.style.left, outline()!.style.top].map(parseFloat)).toEqual([480, 270]);
  });

  it("shows the frame only once the tooltip has sized itself for the card shown (no flash of the previous card)", async () => {
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    computeReady();
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } } });
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(outline()!.style.display).toBe("none");
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-001" });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(outline()!.style.display).toBe("block");
    // Another card: hidden until its own size comes; a late size for the old card changes nothing.
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-002", name: "y", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } } });
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(outline()!.style.display).toBe("none");
    fromFrame(tooltip(), { kind: "size", width: 448, height: 320, shape: "card", cardId: "OP01-001" });
    expect(tooltip()!.style.visibility).toBe("hidden");
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-002" });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(tooltip()!.style.width).toBe("320px");
  });

  it("does not breathe: a size a few pixels off the shown one keeps the shown one", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["320px", "448px"]);
    fromFrame(tooltip(), { kind: "size", width: 323, height: 452, shape: "card", cardId: "OP01-001" });
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["320px", "448px"]);
    fromFrame(tooltip(), { kind: "size", width: 448, height: 320, shape: "card", cardId: "OP01-001" });
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["448px", "320px"]);
  });

  it("moves the tooltip by the card's own displacement when the page moves (no lag, no jump)", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const before = { left: Number.parseFloat(tooltip()!.style.left), top: Number.parseFloat(tooltip()!.style.top) };
    // The page scrolls by 30 px: the video, the card and the tooltip all go up by 30.
    video.getBoundingClientRect = () => ({ left: 0, top: -30, width: 960, height: 540, right: 960, bottom: 510, x: 0, y: -30, toJSON() {} }) as DOMRect;
    document.dispatchEvent(new Event("scroll"));
    expect(Number.parseFloat(outline()!.style.top)).toBe(54 - 30);
    expect(Number.parseFloat(tooltip()!.style.left)).toBe(before.left);
    expect(Number.parseFloat(tooltip()!.style.top)).toBe(Math.max(8, before.top - 30));
  });

  it("ignores scrolls that cannot move the video (a chat scrolling itself)", async () => {
    const frames: Array<() => void> = [];
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (frames.push(() => cb(0)), frames.length));
    const chat = document.createElement("div");
    document.body.appendChild(chat);
    chat.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
    const player = document.createElement("div");
    document.body.appendChild(player);
    player.appendChild(video);
    player.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);
  });

  function withWindow<T>(width: number, height: number, run: () => T): T {
    const w = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const h = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    try {
      return run();
    } finally {
      if (w) Object.defineProperty(window, "innerWidth", w);
      if (h) Object.defineProperty(window, "innerHeight", h);
    }
  }

  it("keeps the shown size against breathing only while it still fits beside the card", async () => {
    agent = await startAgent();
    move(100, 100);
    const card = { cardId: "OP01-001", name: "x", box: { x: 0.3, y: 0.1, width: 0.05, height: 0.2 } };
    withWindow(1024, 768, () => showCard(card));
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["320px", "448px"]);
    // A narrower, shorter window: beside the card there is room for 316 x 442 only (4 and 6 px
    // less, within the no-breathing margin); keeping 320 x 448 would eat the card's margin.
    withWindow(670, 500, () => window.dispatchEvent(new Event("resize")));
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["316px", "442px"]);
  });

  it("stays beside the card through a scroll longer than STICKY_PX when its spot is not the best one", async () => {
    agent = await startAgent();
    move(100, 100);
    const box = { x: 0.4, y: 0.5, width: 0.08, height: 0.2 };
    const onLeft = { x: 0.1, y: 0.4, width: 0.1, height: 0.2 };
    const onRight = { x: 0.6, y: 0.4, width: 0.12, height: 0.2 };
    // At first only the left spot is taken: the tooltip goes right.
    showCard({ cardId: "OP01-001", name: "x", box, others: [onLeft] } as never);
    const right = Number.parseFloat(tooltip()!.style.left);
    expect(right).toBeGreaterThan(384 + 77);
    // Now both spots are taken, the right one a little more: left is best, but not clearly, so
    // it stays right.
    showCard({ cardId: "OP01-001", name: "x", box, others: [onLeft, onRight] } as never);
    expect(Number.parseFloat(tooltip()!.style.left)).toBe(right);
    // The page scrolls 40 px (more than STICKY_PX): it moves with the card and stays right.
    const top = Number.parseFloat(tooltip()!.style.top);
    video.getBoundingClientRect = () => ({ left: 0, top: -40, width: 960, height: 540, right: 960, bottom: 500, x: 0, y: -40, toJSON() {} }) as DOMRect;
    document.dispatchEvent(new Event("scroll"));
    expect(Number.parseFloat(tooltip()!.style.left)).toBe(right);
    expect(Number.parseFloat(tooltip()!.style.top)).toBe(top - 40);
  });

  it("ignores a late size for the previous card that arrives after the new card's own", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-002", name: "y", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } } });
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-002" });
    fromFrame(tooltip(), { kind: "size", width: 448, height: 320, shape: "card", cardId: "OP01-001" });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect([tooltip()!.style.width, tooltip()!.style.height]).toEqual(["320px", "448px"]);
  });

  it("ignores a late size from an earlier showing of the same card", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    fromFrame(tooltip(), { kind: "ready" });
    computeReady();
    const card = { cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    const sent = spyOn(tooltip());
    fromFrame(compute(), { kind: "shown", card });
    const first = sent.filter((m) => m.kind === "card").at(-1)!.seq as number;
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-001", seq: first });
    fromFrame(compute(), { kind: "shown", card: null });
    vi.advanceTimersByTime(HIDE_DELAY_MS + 1);
    fromFrame(compute(), { kind: "shown", card });
    const second = sent.filter((m) => m.kind === "card").at(-1)!.seq as number;
    expect(second).not.toBe(first);
    fromFrame(tooltip(), { kind: "size", width: 448, height: 320, shape: "card", cardId: "OP01-001", seq: first });
    expect(tooltip()!.style.visibility).toBe("hidden");
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-001", seq: second });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(tooltip()!.style.width).toBe("320px");
  });

  it("shows a held card again in the new frame after a full-screen change, without a new card", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "x", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const player = document.createElement("div");
    document.body.appendChild(player);
    player.appendChild(video);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => player });
    try {
      document.dispatchEvent(new Event("fullscreenchange"));
      const fresh = tooltip()!;
      expect(fresh.parentElement).toBe(player);
      fromFrame(fresh, { kind: "ready" });
      // The new frame is asked for the same card at once...
      expect(spyOn(fresh).filter((m) => m.kind === "card").at(-1)).toMatchObject({ cardId: "OP01-001" });
      // ...and shows it, outline too, once it has sized itself: no new pointer move needed.
      fromFrame(fresh, { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-001" });
      expect(fresh.style.visibility).toBe("visible");
      expect(outline()!.style.display).toBe("block");
    } finally {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => null });
    }
  });

  it("removes everything when switched off", async () => {
    agent = await startAgent();
    move(100, 100);
    expect(frames()).toHaveLength(2);
    agent.setEnabled(false);
    expect(frames()).toHaveLength(0);
    move(100, 100);
    expect(frames()).toHaveLength(0);
  });
});

// The toolkit's capture control (page-capture.js) as this content script wires it: the checks
// from the toolkit 0.6.0 outside review, at the level a page's DOM allows. Each capture asked
// here is refused or tried; a refusal is a `capture-failed` with `retry: false`.
describe("Agent and the toolkit's capture control", () => {
  let clock = 1_000;
  const capture = (requestId: number) => fromFrame(compute(), { kind: "capture", requestId, analysisWidth: { min: 720, max: 1920 } });
  const answer = (sent: Array<Record<string, unknown>>, requestId: number) => sent.filter((m) => m.requestId === requestId).at(-1);
  /** True when the gate refused; false when the capture was tried (it answered something else). */
  const refused = (sent: Array<Record<string, unknown>>, requestId: number) => {
    const m = answer(sent, requestId);
    if (!m) throw new Error(`capture ${requestId} was not answered`);
    return m.kind === "capture-failed" && m.retry === false && m.reason === "not pointing at the video";
  };

  beforeEach(() => {
    clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => vi.restoreAllMocks());

  it("1: ignores a made-up message from the page that names the compute frame as its source", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    fromFrame(tooltip(), { kind: "ready" });
    const card = { cardId: "OP01-001", name: "Forged", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    const sent = spyOn(compute());
    // Source and origin are both right; the browser did not make the event.
    window.dispatchEvent(message(tag({ kind: "shown", card }), EXT, compute()!.contentWindow, false));
    window.dispatchEvent(message(tag({ kind: "capture", requestId: 41, analysisWidth: { min: 720, max: 1920 } }), EXT, compute()!.contentWindow, false));
    window.dispatchEvent(message(tag({ kind: "size", width: 900, height: 900, shape: "card", cardId: "OP01-001" }), EXT, tooltip()!.contentWindow, false));
    expect(spyOn(tooltip()).filter((m) => m.kind === "card")).toEqual([]);
    expect(answer(sent, 41)).toBeUndefined();
    expect(tooltip()!.style.width).not.toBe("900px");
  });

  it("2: refuses before any hover, after the pointer leaves, in a background tab, and after another video", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    const sent = spyOn(compute());
    // A move off the picture ends the hover.
    move(100, 600);
    capture(1);
    expect(refused(sent, 1)).toBe(true);
    // Back over it: allowed (tried; the stand-in canvas has no 2D context).
    move(100, 100);
    capture(2);
    await settle();
    expect(refused(sent, 2)).toBe(false);
    // The tab goes to the background.
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    capture(3);
    expect(refused(sent, 3)).toBe(true);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    // The pointer leaves the document.
    move(100, 100);
    const leave = new PointerEvent("pointerleave", { pointerType: "mouse" });
    Object.defineProperty(leave, "isTrusted", { value: true });
    document.documentElement.dispatchEvent(leave);
    capture(4);
    expect(refused(sent, 4)).toBe(true);
  });

  it("2: a video that moved away under a resting pointer (a keyboard scroll) is refused", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    const sent = spyOn(compute());
    video.getBoundingClientRect = () => ({ left: 0, top: -800, width: 960, height: 540, right: 960, bottom: -260, x: 0, y: -800, toJSON() {} }) as DOMRect;
    capture(5);
    expect(refused(sent, 5)).toBe(true);
  });

  it("switching to another video tells the compute frame of a new source and clears the gate", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    const sent = spyOn(compute());
    sent.length = 0;
    // A larger video appears; the next pick (after the 1 s recheck) takes it.
    const other = makeVideo();
    other.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720, x: 0, y: 0, toJSON() {} }) as DOMRect;
    clock += 1_500;
    move(100, 100);
    expect(sent.filter((m) => m.kind === "discontinuity")).toContainEqual(expect.objectContaining({ kind: "discontinuity", newSource: true }));
    // The move that picked it is over its picture: a hover on the new video.
    capture(6);
    await settle();
    expect(refused(sent, 6)).toBe(false);
  });

  it("rest cap: a card showing under a resting pointer keeps pictures coming for at most 60 s", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    const sent = spyOn(compute());
    // Past the 10 s grace, a card showing keeps the authority.
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } } });
    clock += 30_000;
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } } });
    capture(7);
    await settle();
    expect(refused(sent, 7)).toBe(false);
    // 60 s after the last movement: no more, card or not.
    clock += 30_000;
    capture(8);
    expect(refused(sent, 8)).toBe(true);
    // A fresh move starts it again.
    move(102, 100);
    capture(9);
    await settle();
    expect(refused(sent, 9)).toBe(false);
  });

  it("3: a tap allows a picture after the finger lifts, for 10 s, and a card showing does not stretch it", async () => {
    agent = await startAgent();
    pointer("pointerdown", 100, 100, { pointerType: "touch", pointerId: 5 });
    computeReady();
    const sent = spyOn(compute());
    pointer("pointerup", 100, 100, { pointerType: "touch", pointerId: 5 });
    capture(10);
    await settle();
    expect(refused(sent, 10)).toBe(false);
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } } });
    clock += 10_000;
    capture(11);
    expect(refused(sent, 11)).toBe(true);
  });

  it("4: another contract version never captures; the same frame saying ready twice changes nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    agent = await startAgent();
    move(100, 100);
    const sent = spyOn(compute());
    fromFrame(compute(), { kind: "ready", version: PROTOCOL_VERSION + 1, instance: INSTANCE });
    capture(12);
    expect(answer(sent, 12)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("reload the page"));
    computeReady();
    move(101, 100);
    sent.length = 0;
    computeReady();
    // An answer to a repeated hello: no new presented, no pointer resent.
    expect(sent).toEqual([]);
  });

  it("4: a compute frame the page removed is made again, says hello, and is told the picture's time and the pointer", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    compute()!.remove();
    move(110, 100);
    const sent = spyOn(compute());
    expect(sent.filter((m) => m.kind === "hello")).toHaveLength(1);
    computeReady("fedcba9876543210");
    expect(sent.map((m) => m.kind)).toEqual(expect.arrayContaining(["presented", "pointer"]));
  });

  /** The compute frame reports that it ended its worker when idle (toolkit 0.12.0). */
  const idle = () => fromFrame(compute(), { kind: "status", state: "idle", error: null, backend: null });

  it("idle: both frames and the outline go, and nothing is made by a move off the video", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } });
    expect(tooltip()!.style.visibility).toBe("visible");
    move(2000, 2000); // off the picture: the card goes, then the frame goes idle
    fromFrame(compute(), { kind: "shown", card: null });
    idle();
    expect(frames()).toEqual([]);
    expect(outline()).toBeNull();
    move(2000, 1500);
    expect(frames()).toEqual([]);
  });

  it("idle: the next trusted move over the video makes both frames once, says hello, and tells the pointer", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    expect(frames()).toEqual([]);
    move(110, 100);
    expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
    expect(frames().filter((f) => f.src.endsWith("/tooltip.html"))).toHaveLength(1);
    const sent = spyOn(compute());
    expect(sent.filter((m) => m.kind === "hello")).toHaveLength(1);
    move(120, 100); // still before the new frame's ready: the agent makes nothing of its own
    expect(frames()).toHaveLength(2);
    computeReady("fedcba9876543210");
    expect(sent.map((m) => m.kind)).toEqual(expect.arrayContaining(["presented", "pointer"]));
  });

  it("idle: a page script's move over the video makes nothing, and the frames made again go idle again", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    trustedEvents = false;
    move(110, 100);
    expect(frames()).toEqual([]);
    trustedEvents = true;
    move(110, 100);
    computeReady("fedcba9876543210");
    idle();
    expect(frames()).toEqual([]);
  });

  it("idle: the same card shown before and after an unload reaches the new tooltip", async () => {
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } });
    fromFrame(compute(), { kind: "shown", card: null });
    idle();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.05, y: 0.1, width: 0.1, height: 0.3 } });
    fromFrame(tooltip(), { kind: "ready" });
    expect(spyOn(tooltip()).some((m) => m.kind === "card" && m.cardId === "OP01-001")).toBe(true);
    expect(tooltip()!.style.visibility).toBe("visible");
  });

  it("idle: frames made again and removed before their handshake (hovers off and on) are made again by the next move", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    move(110, 100); // the control's make(): both frames, no handshake yet
    agent.setEnabled(false);
    expect(frames()).toEqual([]);
    agent.setEnabled(true);
    move(120, 100);
    expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
    expect(frames().filter((f) => f.src.endsWith("/tooltip.html"))).toHaveLength(1);
    const sent = spyOn(compute());
    expect(sent.some((m) => m.kind === "hello")).toBe(true);
    computeReady("fedcba9876543210");
    expect(sent.map((m) => m.kind)).toEqual(expect.arrayContaining(["presented", "pointer"]));
  });

  it("idle: hovers turned off and on while the video plays load both frames at once, and the next idle unloads them again", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    expect(frames()).toEqual([]);
    agent.setEnabled(false);
    agent.setEnabled(true);
    expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
    expect(frames().filter((f) => f.src.endsWith("/tooltip.html"))).toHaveLength(1);
    const sent = spyOn(compute());
    expect(sent.some((m) => m.kind === "hello")).toBe(true);
    // The next move over the picture (the control's make()) makes no second pair.
    move(110, 100);
    expect(frames()).toHaveLength(2);
    computeReady("fedcba9876543210");
    idle();
    expect(frames()).toEqual([]);
    // Unloaded again: the video playing on (a loop) makes nothing.
    playing();
    expect(frames()).toEqual([]);
  });

  it("idle: hovers turned off and on while the video is paused load at its next play, and only once", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    media.paused = true;
    agent.setEnabled(false);
    agent.setEnabled(true);
    expect(frames()).toEqual([]);
    media.paused = false;
    playing();
    expect(frames()).toHaveLength(2);
    computeReady("fedcba9876543210");
    idle();
    playing();
    expect(frames()).toEqual([]);
  });

  it("idle: hovers turned off and on in a background tab load nothing until the tab comes to the front", async () => {
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      agent = await startAgent();
      move(100, 100);
      computeReady();
      idle();
      setVisibility("hidden");
      agent.setEnabled(false);
      agent.setEnabled(true);
      expect(frames()).toEqual([]);
      // The video playing on in the background (a loop) makes nothing either.
      playing();
      expect(frames()).toEqual([]);
      setVisibility("visible");
      expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
      expect(frames().filter((f) => f.src.endsWith("/tooltip.html"))).toHaveLength(1);
      // Nothing more is owed: hiding and showing again makes no second pair.
      setVisibility("hidden");
      setVisibility("visible");
      expect(frames()).toHaveLength(2);
      // Turned off again before coming to the front: nothing is made on return.
      computeReady("fedcba9876543210");
      idle();
      setVisibility("hidden");
      agent.setEnabled(false);
      agent.setEnabled(true);
      agent.setEnabled(false);
      setVisibility("visible");
      expect(frames()).toEqual([]);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    }
  });

  it("hovers turned off and on in a background tab with no idle unload load at once, as before", async () => {
    try {
      agent = await startAgent();
      move(100, 100);
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      agent.setEnabled(false);
      agent.setEnabled(true);
      expect(frames()).toHaveLength(2);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    }
  });

  it("idle: a full-screen change while the frames are removed makes no frame", async () => {
    agent = await startAgent();
    move(100, 100);
    computeReady();
    idle();
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(frames()).toEqual([]);
  });

  // Loading at play (owner 2026-11-10 "Products load at video play", for Kenbunshoku 2026-11-12).
  it("play: a main video already playing when hovers come on gets both frames, with no pointer move", async () => {
    agent = await startAgent();
    expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
    expect(frames().filter((f) => f.src.endsWith("/tooltip.html"))).toHaveLength(1);
    expect(spyOn(compute()).some((m) => m.kind === "hello")).toBe(true);
  });

  it("play: a paused main video gets them at its first playing event, and not before", async () => {
    media.paused = true;
    agent = await startAgent();
    expect(frames()).toEqual([]);
    media.paused = false;
    playing();
    expect(frames()).toHaveLength(2);
  });

  it("play: loading takes no picture; the frame's capture before any pointer is refused", async () => {
    agent = await startAgent();
    computeReady();
    const sent = spyOn(compute());
    capture(1);
    expect(refused(sent, 1)).toBe(true);
    move(100, 100);
    capture(2);
    await settle();
    expect(refused(sent, 2)).toBe(false);
  });

  it("play: a playing event a page script made, or one from a paused video, makes nothing", async () => {
    media.paused = true;
    agent = await startAgent();
    playing(video, false);
    playing(video, true); // still paused: the toolkit's loadWhen waits for a video really playing
    expect(frames()).toEqual([]);
  });

  it("play: a small video playing (a preview) makes nothing; the main video playing does", async () => {
    media.paused = true;
    agent = await startAgent();
    const small = document.createElement("video");
    Object.defineProperties(small, { videoWidth: { value: 640 }, videoHeight: { value: 360 }, paused: { value: false } });
    small.getBoundingClientRect = () => ({ left: 980, top: 0, width: 200, height: 112, right: 1180, bottom: 112, x: 980, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(small);
    playing(small);
    expect(frames()).toEqual([]);
    media.paused = false;
    playing();
    expect(frames()).toHaveLength(2);
  });

  it("play: with hovers off a playing video makes nothing; turning them on makes the frames", async () => {
    trustedEvents = true;
    agent = new Agent({ dev: true });
    agent.start();
    playing();
    expect(frames()).toEqual([]);
    agent.setEnabled(true);
    expect(frames()).toHaveLength(2);
    agent.setEnabled(false);
    expect(frames()).toEqual([]);
    agent.setEnabled(true);
    expect(frames()).toHaveLength(2);
  });

  it("play: not on an inactive page", async () => {
    vi.stubGlobal("location", new URL("https://www.youtube.com/"));
    agent = await startAgent();
    playing();
    expect(frames()).toEqual([]);
  });

  it("play: after an idle unload, the video playing again (a loop) makes nothing; the next trusted move does", async () => {
    agent = await startAgent();
    computeReady();
    idle();
    expect(frames()).toEqual([]);
    playing();
    media.paused = true;
    media.paused = false;
    playing();
    expect(frames()).toEqual([]);
    move(110, 100);
    expect(frames()).toHaveLength(2);
    expect(spyOn(compute()).filter((m) => m.kind === "hello")).toHaveLength(1);
  });

  /** Another video element in the page, playing, of the given size at the top left. */
  function otherVideo(width: number, height: number): HTMLVideoElement {
    const v = document.createElement("video");
    Object.defineProperties(v, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, paused: { value: false }, readyState: { value: 4 }, currentTime: { value: 3 } });
    v.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(v);
    return v;
  }

  it("play: after an idle unload, a new larger video playing makes nothing; a trusted move over it does", async () => {
    agent = await startAgent();
    computeReady();
    idle();
    const bigger = otherVideo(1280, 720);
    playing(bigger);
    expect(frames()).toEqual([]);
    move(110, 100);
    expect(frames()).toHaveLength(2);
  });

  it("play: a main video replaced by another element loads when the new one plays", async () => {
    media.paused = true;
    agent = await startAgent();
    expect(frames()).toEqual([]);
    video.remove();
    const next = otherVideo(960, 540);
    playing(next);
    expect(frames()).toHaveLength(2);
  });

  it("play: the main video starting to play while too small to count loads once it is the main video again", async () => {
    video.remove();
    let width = 960;
    let paused = true;
    const v = document.createElement("video");
    Object.defineProperties(v, { videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, paused: { get: () => paused }, readyState: { value: 4 }, currentTime: { value: 3 } });
    v.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: width * 0.5625, right: width, bottom: width * 0.5625, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(v);
    agent = await startAgent(); // paused main video: watched, nothing made
    expect(frames()).toEqual([]);
    width = 200; // the player shrank (a mini player) and then plays: not the main video now
    paused = false;
    playing(v);
    expect(frames()).toEqual([]);
    width = 960; // back to full size, still playing
    playing(v);
    expect(frames()).toHaveLength(2);
  });

  it("play: on a Twitch page that is not a channel's page, a past broadcast or a clip (the front page's featured stream), playing makes nothing; the pointer does", async () => {
    vi.stubGlobal("location", new URL("https://www.twitch.tv/"));
    agent = await startAgent();
    playing();
    expect(frames()).toEqual([]);
    vi.stubGlobal("location", new URL("https://www.twitch.tv/directory/category/one-piece-card-game"));
    playing();
    expect(frames()).toEqual([]);
    move(100, 100);
    expect(frames()).toHaveLength(2);
  });

  it("play: in an embedded YouTube player (a muted video playing by itself on another website), playing makes nothing; the pointer does", async () => {
    vi.stubGlobal("location", new URL("https://www.youtube.com/embed/abc?autoplay=1&mute=1"));
    agent = await startAgent();
    playing();
    expect(frames()).toEqual([]);
    move(100, 100);
    expect(frames()).toHaveLength(2);
  });

  it("play: a Twitch channel's page, a past broadcast or a clip loads at play", async () => {
    for (const page of ["https://www.twitch.tv/somechannel", "https://www.twitch.tv/videos/123456789", "https://www.twitch.tv/somechannel/clip/SomeClip-Ab_12"]) {
      agent?.stop();
      for (const f of frames()) f.remove();
      vi.stubGlobal("location", new URL(page));
      media.paused = true;
      agent = await startAgent();
      expect(frames()).toEqual([]);
      media.paused = false;
      playing();
      expect(frames(), page).toHaveLength(2);
    }
  });

  it("play: a watch started on a channel's page makes nothing if the video first plays after the page changed to the front page; it loads on a channel's page again", async () => {
    vi.stubGlobal("location", new URL("https://www.twitch.tv/somechannel"));
    media.paused = true;
    agent = await startAgent(); // paused: watched, nothing made
    vi.stubGlobal("location", new URL("https://www.twitch.tv/"));
    media.paused = false;
    playing();
    expect(frames()).toEqual([]);
    vi.stubGlobal("location", new URL("https://www.twitch.tv/otherchannel"));
    playing(); // the same element plays on (a seek, a stall): a new watch, already playing
    expect(frames()).toHaveLength(2);
  });

  it("play: a video playing in a background tab loads (no visibility filter) but is never captured; coming back invents no authority, and delayed ticks are all refused", async () => {
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      media.paused = true;
      agent = await startAgent();
      setVisibility("hidden");
      media.paused = false;
      playing();
      expect(frames()).toHaveLength(2);
      computeReady();
      const sent = spyOn(compute());
      capture(1);
      expect(refused(sent, 1)).toBe(true);
      // Back in front, the pointer resting where it was: the frame's late ticks arrive together.
      setVisibility("visible");
      for (const id of [2, 3, 4, 5]) capture(id);
      await settle();
      for (const id of [2, 3, 4, 5]) expect(refused(sent, id)).toBe(true);
      expect(sent.some((m) => m.kind === "frame")).toBe(false);
      // A hover, then the tab hidden and shown again: the hover ended with the hide.
      move(100, 100);
      capture(6);
      await settle();
      expect(refused(sent, 6)).toBe(false);
      setVisibility("hidden");
      setVisibility("visible");
      for (const id of [7, 8, 9]) capture(id);
      await settle();
      for (const id of [7, 8, 9]) expect(refused(sent, id)).toBe(true);
      // The pointer moves over the video again: allowed again.
      move(105, 100);
      capture(10);
      await settle();
      expect(refused(sent, 10)).toBe(false);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    }
  });

  it("play: frames the page removed are made again at the main video's next trusted playing (S-A10)", async () => {
    agent = await startAgent();
    const first = { compute: compute()!, tooltip: tooltip()! };
    first.compute.remove();
    first.tooltip.remove();
    // A page script's made-up event makes nothing.
    playing(video, false);
    expect(frames()).toEqual([]);
    playing();
    expect(frames()).toHaveLength(2);
    expect(compute()).not.toBe(first.compute);
    expect(tooltip()).not.toBe(first.tooltip);
  });

  it("play: a tooltip frame the page removed alone is made again at the next trusted playing, and the compute frame kept (S-A10)", async () => {
    agent = await startAgent();
    const kept = compute()!;
    const first = tooltip()!;
    first.remove();
    playing();
    expect(compute()).toBe(kept);
    expect(tooltip()).toBeDefined();
    expect(tooltip()).not.toBe(first);
  });

  it("play: a frame the page removed is also made again at the next trusted move (S-A10)", async () => {
    agent = await startAgent();
    const first = compute()!;
    first.remove();
    move(100, 100);
    expect(compute()).toBeDefined();
    expect(compute()).not.toBe(first);
  });

  it("play: on a page that does not load at play (an embedded player), a removed frame waits for a move", async () => {
    vi.stubGlobal("location", new URL("https://www.youtube.com/embed/abc"));
    agent = new Agent({ dev: false });
    agent.start();
    agent.setEnabled(true);
    await settle();
    move(100, 100);
    const first = compute()!;
    first.remove();
    playing();
    expect(compute()).toBeUndefined();
    move(110, 110);
    expect(compute()).toBeDefined();
    expect(compute()).not.toBe(first);
  });

  it("play: another video playing does not make a removed frame again (S-A10)", async () => {
    agent = await startAgent();
    compute()!.remove();
    const other = document.createElement("video");
    document.body.append(other);
    try {
      playing(other);
      expect(compute()).toBeUndefined();
    } finally {
      other.remove();
    }
  });

  it("hold: keeps the tooltip but draws no outline for a card the reading hold marks held, and outlines it again once seen there", async () => {
    agent = await startAgent();
    move(100, 100);
    const card = { cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } };
    showCard(card);
    expect(outline()!.style.display).toBe("block");
    const sent = spyOn(tooltip());
    const cardMessages = () => sent.filter((m) => m.kind === "card").length;
    const before = cardMessages();
    fromFrame(compute(), { kind: "shown", card: { ...card, held: true } });
    expect(tooltip()!.style.visibility).toBe("visible");
    expect(outline()!.style.display).toBe("none");
    // The same card: the tooltip is not sent it again.
    expect(cardMessages()).toBe(before);
    fromFrame(compute(), { kind: "shown", card });
    expect(outline()!.style.display).toBe("block");
  });

  it("keep card: a change remakes the running compute frame, keeps the tooltip frame, clears the card on show and says hello to the new frame", async () => {
    vi.useFakeTimers();
    agent = await startAgent();
    move(100, 100);
    showCard({ cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } });
    const oldCompute = compute()!;
    const oldTooltip = tooltip()!;
    agent.restartForKeepCard();
    expect(oldCompute.isConnected).toBe(false);
    expect(compute()).toBeDefined();
    expect(compute()).not.toBe(oldCompute);
    expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
    expect(tooltip()).toBe(oldTooltip);
    expect(tooltip()!.style.visibility).toBe("hidden");
    expect(outline()!.style.display).toBe("none");
    expect(spyOn(compute()).filter((m) => m.kind === "hello")).toHaveLength(1);
    // The old frame's messages are no longer taken: a card from it shows nothing.
    window.dispatchEvent(message(tag({ kind: "shown", card: { cardId: "OP01-002", name: "x", box: { x: 0.5, y: 0.5, width: 0.1, height: 0.2 } } }), EXT, oldCompute.contentWindow));
    expect(tooltip()!.style.visibility).toBe("hidden");
    // The new frame takes over: the pointer still over the video is told, and its card shows.
    computeReady("fedcba9876543210");
    expect(spyOn(compute()).map((m) => m.kind)).toEqual(expect.arrayContaining(["presented", "pointer"]));
    fromFrame(compute(), { kind: "shown", card: { cardId: "OP01-001", name: "Zoro", box: { x: 0.1, y: 0.1, width: 0.1, height: 0.2 } } });
    fromFrame(tooltip(), { kind: "size", width: 320, height: 448, shape: "card", cardId: "OP01-001" });
    expect(tooltip()!.style.visibility).toBe("visible");
  });

  it("keep card: a change makes nothing where no compute frame runs (not loaded yet, hovers off, or an idle unload waiting for the pointer)", async () => {
    media.paused = true;
    agent = await startAgent();
    agent.restartForKeepCard();
    expect(frames()).toEqual([]);
    agent.setEnabled(false);
    agent.restartForKeepCard();
    expect(frames()).toEqual([]);
    agent.setEnabled(true);
    move(100, 100);
    computeReady();
    fromFrame(compute(), { kind: "status", state: "idle", error: null, backend: null });
    expect(frames()).toEqual([]);
    agent.restartForKeepCard();
    expect(frames()).toEqual([]);
    // The next trusted move makes them, as after any idle unload.
    move(110, 100);
    expect(frames()).toHaveLength(2);
  });

  it("keep card: a tab in the background remakes its compute frame only when it comes to the front, once", async () => {
    const setVisibility = (state: "hidden" | "visible") => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      agent = await startAgent();
      move(100, 100);
      const first = compute()!;
      setVisibility("hidden");
      agent.restartForKeepCard();
      agent.restartForKeepCard(); // flipped twice while away: still one remake
      expect(compute()).toBe(first);
      expect(first.isConnected).toBe(true);
      setVisibility("visible");
      const second = compute()!;
      expect(second).not.toBe(first);
      expect(first.isConnected).toBe(false);
      expect(frames().filter((f) => f.src.endsWith("/compute.html"))).toHaveLength(1);
      // Nothing owed any more: hiding and showing again makes nothing.
      setVisibility("hidden");
      setVisibility("visible");
      expect(compute()).toBe(second);
      // A frame made while the change was owed reads the switch itself: nothing more on return.
      setVisibility("hidden");
      agent.restartForKeepCard();
      agent.setEnabled(false);
      agent.setEnabled(true);
      move(110, 100);
      const third = compute()!;
      expect(third).not.toBe(second);
      setVisibility("visible");
      expect(compute()).toBe(third);
      // An idle unload while it was owed: nothing is made on return; the next move makes them.
      setVisibility("hidden");
      agent.restartForKeepCard();
      computeReady();
      fromFrame(compute(), { kind: "status", state: "idle", error: null, backend: null });
      expect(frames()).toEqual([]);
      setVisibility("visible");
      expect(frames()).toEqual([]);
    } finally {
      setVisibility("visible");
    }
  });
});
