// SPDX-License-Identifier: Apache-2.0
// The content script's work in a video page.
//
//   - It follows the page's main video (the largest one on show) and hands it to the toolkit's
//     capture control (vendored page-capture.js, createCaptureControl; its contract is the
//     toolkit's docs/extension-session.md). The control reports the video and the pointer to the
//     compute frame, and takes a picture when the frame asks, only on the authority of the
//     viewer's own (trusted) pointer events: a hover over the picture, for 10 seconds after the
//     pointer last moved there, then while a card shows under the resting pointer (until 5
//     seconds after it stops showing), and never more than 60 seconds after the last movement;
//     a tap, for 10 seconds. Pictures go only to that frame, which is the extension's own;
//     nothing is sent over the network.
//   - Nothing is analyzed until the pointer first comes over a picture: that is when the two
//     frames are created and the model loads.
//   - It shows the tooltip frame (the card's picture alone, or its name) beside the card the
//     compute frame names, placed off the cards around it and scaled down when the page has no
//     room for it, and hides it shortly after. Nothing it shows takes the pointer: hovering goes
//     on to the card underneath.
//   - It outlines the card the tooltip names (outline.ts): the same accepted box, shown and
//     hidden with the tooltip, never taking the pointer.
//   - It is on for every video (owner, 2026-10-27: no per-channel switch; the popup's switch is
//     the only control), but dormant until the pointer first comes over a picture: until then no
//     frame is made, no model loads and nothing is downloaded, so a video nobody points at costs
//     nothing. The popup's switch turned off removes the frames again.
//   - Messages from its frames are taken only when the browser marks them as trusted and they
//     come from that frame and the extension's origin (fromExtensionFrame): a page cannot make up
//     a card for the tooltip or a capture request.

import { CONFIG } from "../config.js";
import { MIN_VIDEO_WIDTH } from "../constants.js";
import { parseTooltipOut, TAG, tag, type TooltipIn, type TooltipSize } from "../shared/messages.js";
import { type CaptureControl, computeProtocol, createCaptureControl, fromExtensionFrame, type ShownCard } from "../../vendor/cardvision-browser/page-capture.js";
import { availableSpace, fitBesideCard, fitTooltipSize, fractionIn, pictureRect, placeTooltipAvoiding, type Rect, scaleTooltipSize, tooltipRadius } from "./geometry.js";
import { isActivePage } from "./site.js";
import { CardOutline, outlineRect } from "./outline.js";

function sameSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return a.width === b.width && a.height === b.height;
}

/** A new fitted size closer than this to the shown one keeps the shown one (no breathing). */
const SIZE_HYSTERESIS_PX = 8;
/** The tooltip goes this long after the card is no longer under the pointer. */
export const HIDE_DELAY_MS = 120;
const VIDEO_RECHECK_MS = 1_000;
/** The extension's frames in the page: `all:initial` first, so none of the page's styles for
 *  iframes reach them. */
const FRAME_STYLE = "all:initial;position:fixed;display:block;border:0;margin:0;padding:0;background:transparent;color-scheme:normal;transform:none;filter:none;";

export interface AgentOptions {
  dev: boolean;
}

export class Agent {
  private enabled = false;
  private video: HTMLVideoElement | null = null;
  private videoPickedAt = -Infinity;
  private detachVideo: (() => void) | null = null;
  /** The toolkit's capture control: the gate, the handshake, the video's events and the pictures. */
  private control: CaptureControl | null = null;

  private compute: HTMLIFrameElement | null = null;
  private tooltip: HTMLIFrameElement | null = null;
  private tooltipReady = false;
  /** The tooltip's own size (tooltip.ts), before it is fitted into the page. */
  private tooltipSize: TooltipSize = { width: 320, height: 448, shape: "card" };
  /** The size it is shown at. */
  private shownSize = { width: 320, height: 448 };
  /** The viewer's card size (the popup's dial), as a factor of the tooltip's own size. */
  private cardScale = 1;
  private pendingTooltip: TooltipIn | null = null;

  private shown: ShownCard | null = null;
  private displayedCardId: string | null = null;
  /** The card the tooltip shows (also while it is held for the quick hide), for re-placing it. */
  private displayedCard: ShownCard | null = null;
  /** A re-placement waiting for the next animation frame (resize, scroll, the video moving). */
  private relayoutPending = false;
  /** The card whose own size the tooltip has sent: the frame is shown only for that card, so
   *  it never shows a previous card or the wrong shape. */
  private sizedCardId: string | null = null;
  /** Numbers each card message sent to the tooltip; its sizes echo it (stale ones are ignored). */
  private cardSeq = 0;
  /** Where the displayed card was last placed against, so the tooltip moves with it. */
  private placedFor: { cardId: string; rect: Rect } | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private loadError: string | null = null;
  /** The outline around the card the tooltip names (a shadow root in the page). */
  private outline: CardOutline | null = null;
  private stopListening: (() => void) | null = null;

  /** `chrome-extension://<id>`: the extension's base address without its trailing slash. */
  private readonly extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");

  constructor(private readonly options: AgentOptions) {}

  start(): void {
    // Ours first: the same trusted event that first comes over a picture attaches the video and
    // makes the frames, then reaches the control (both on the window, in the capture phase).
    window.addEventListener("pointermove", this.onPointer, { capture: true, passive: true });
    window.addEventListener("pointerdown", this.onPointer, { capture: true, passive: true });
    this.control = createCaptureControl({
      protocol: computeProtocol(TAG),
      frame: () => this.compute?.contentWindow ?? null,
      frameOrigin: this.extensionOrigin,
      onShown: (card) => {
        this.shown = card;
        this.updateTooltip();
      },
      onStatus: (status) => {
        if (status.state === "failed" && status.error !== this.loadError) {
          this.loadError = status.error;
          // The page's own console only; nothing is reported anywhere.
          console.warn(`${CONFIG.name}: the card recognition model did not load (${status.error ?? "unknown reason"}).`);
        }
      },
      onProblem: (problem) => {
        // A compute frame of another version (an update half applied): nothing is captured.
        if (problem.kind === "version") console.warn(`${CONFIG.name}: reload the page to finish updating the extension.`);
      },
    });
    this.stopListening = this.control.listen(window, document);
    window.addEventListener("message", this.onMessage);
    document.addEventListener("fullscreenchange", this.onFullscreen);
    // The page moving under a held card: the tooltip and the outline follow it.
    window.addEventListener("resize", this.onLayout, { passive: true });
    document.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
  }

  /** Whether the viewer's pointer holds capture authority now (the control's gate). */
  private pointing(): boolean {
    return this.control?.gateState().inside ?? false;
  }

  /** A scroll that can move the video: the page's own, or a box holding the player. Others (a
   *  chat that scrolls itself) are ignored, so they do not force a layout every frame. */
  private readonly onScroll = (event: Event): void => {
    const target = event.target;
    if (target === document || target === document.documentElement || target === document.body || target === document.scrollingElement) {
      this.onLayout();
      return;
    }
    if (target instanceof Element && this.video && target.contains(this.video)) this.onLayout();
  };

  /** The window was resized or scrolled, or the video's box changed: while a card is shown,
   *  place its tooltip and outline again, at most once an animation frame. */
  private readonly onLayout = (): void => {
    if (this.displayedCardId === null || this.relayoutPending) return;
    this.relayoutPending = true;
    requestAnimationFrame(() => {
      this.relayoutPending = false;
      const video = this.video;
      if (!video) return;
      const card = this.displayedCard;
      if (this.displayedCardId === null || !card) return;
      this.showTooltip(card, video);
    });
  };

  /** Stop listening and remove everything the agent added to the page. */
  stop(): void {
    window.removeEventListener("pointermove", this.onPointer, { capture: true });
    window.removeEventListener("pointerdown", this.onPointer, { capture: true });
    window.removeEventListener("message", this.onMessage);
    document.removeEventListener("fullscreenchange", this.onFullscreen);
    window.removeEventListener("resize", this.onLayout);
    document.removeEventListener("scroll", this.onScroll, { capture: true });
    this.enabled = false;
    this.teardown();
    this.stopListening?.();
    this.stopListening = null;
    this.control?.stop();
    this.control = null;
  }

  /** The popup's card size changed (a percentage, already clamped): a card on show is fitted
   *  again at once. */
  setCardSize(percent: number): void {
    const scale = percent / 100;
    if (!(scale > 0) || scale === this.cardScale) return;
    this.cardScale = scale;
    this.onLayout();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) this.teardown();
  }

  // ------------------------------------------------------------------ the pointer
  /** Picks the video and makes the frames; the control itself takes the pointer for the gate. */
  private readonly onPointer = (event: PointerEvent): void => {
    // Only the viewer's own pointer counts: events a page script makes are ignored.
    if (event.isTrusted !== true) return;
    if (!this.enabled || !isActivePage(new URL(location.href), this.options.dev)) {
      this.attachVideo(null);
      return;
    }
    const video = this.currentVideo();
    // Both frames there: nothing more to do here (the control measures the picture itself; a
    // second measure per move would only cost the page a layout).
    if (!video || (this.compute?.isConnected && this.tooltip?.isConnected)) return;
    // The first trusted move over a picture starts the page's session (the frames, the model).
    if (fractionIn(this.pictureOf(video), event.clientX, event.clientY)) this.ensureFrames();
  };

  // ------------------------------------------------------------------ the video
  private currentVideo(): HTMLVideoElement | null {
    const now = performance.now();
    if (this.video?.isConnected && now - this.videoPickedAt < VIDEO_RECHECK_MS) return this.video;
    this.videoPickedAt = now;
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (r.width >= MIN_VIDEO_WIDTH && v.videoWidth > 0 && area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    this.attachVideo(best);
    return best;
  }

  private pictureOf(video: HTMLVideoElement): Rect {
    return pictureRect(video.getBoundingClientRect(), { width: video.videoWidth, height: video.videoHeight }, getComputedStyle(video).objectFit);
  }

  /** Hand the video to the control (another video clears the gate and is a new source to the
   *  frame), and follow its box for the tooltip. */
  private attachVideo(video: HTMLVideoElement | null): void {
    if (video === this.video) return;
    this.detachVideo?.();
    this.detachVideo = null;
    this.video = video;
    this.control?.attach(video);
    if (!video) return;
    // The player resized (theater mode, the site's own layout): see onLayout.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.onLayout()) : null;
    observer?.observe(video);
    this.detachVideo = () => observer?.disconnect();
  }

  // ------------------------------------------------------------------ the frames
  private ensureFrames(): void {
    // A frame the page removed is made again.
    if (this.compute && !this.compute.isConnected) this.compute = null;
    if (this.tooltip && !this.tooltip.isConnected) {
      this.tooltip = null;
      this.tooltipReady = false;
      this.displayedCardId = null;
      this.sizedCardId = null;
    }
    if (!this.compute) {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      // Not display:none: a hidden frame keeps running, and the browser may slow a frame that is
      // not rendered.
      frame.style.cssText = `${FRAME_STYLE}width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none;`;
      frame.src = chrome.runtime.getURL("compute.html");
      document.documentElement.appendChild(frame);
      this.compute = frame;
      // Hello until the new frame says ready; the control then tells it the picture's time and
      // the pointer that started it.
      this.control?.connect();
    }
    if (!this.tooltip) this.createTooltip();
  }

  private createTooltip(): void {
    const frame = document.createElement("iframe");
    frame.title = "Card";
    // Not in the tab order: there is nothing in it to focus.
    frame.tabIndex = -1;
    // Nothing in it can be clicked: the pointer passes through to whatever is under it.
    frame.style.cssText = `${FRAME_STYLE}z-index:2147483646;visibility:hidden;pointer-events:none;width:${this.shownSize.width}px;height:${this.shownSize.height}px;left:0;top:0;border-radius:${tooltipRadius(this.shownSize, "card")}px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35);`;
    frame.src = chrome.runtime.getURL("tooltip.html");
    this.tooltipReady = false;
    const host = this.mountHost();
    host.appendChild(frame);
    this.tooltip = frame;
    this.outline?.remove();
    this.outline = new CardOutline(host);
  }

  /** In full screen only the full-screen element is drawn, so the tooltip goes inside it. */
  private mountHost(): Element {
    const fs = document.fullscreenElement;
    return fs && !(fs instanceof HTMLVideoElement) && !(fs instanceof HTMLIFrameElement) ? fs : document.documentElement;
  }

  private readonly onFullscreen = (): void => {
    if (!this.tooltip) return;
    // Moving a frame reloads it: make a new one where it will be drawn.
    const held = this.displayedCardId !== null ? this.displayedCard : null;
    this.tooltip.remove();
    this.outline?.remove();
    this.outline = null;
    this.tooltip = null;
    this.displayedCardId = null;
    this.sizedCardId = null;
    this.createTooltip();
    // A card shown (or held, on a paused video) is shown again in the new frame, rather than
    // waiting for the pointer to reach another card.
    if (held && this.video) this.showTooltip(held, this.video);
  };

  private toTooltip(message: TooltipIn): void {
    if (!this.tooltip?.contentWindow || !this.tooltipReady) {
      this.pendingTooltip = message;
      return;
    }
    this.tooltip.contentWindow.postMessage(tag(message), this.extensionOrigin);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    // The compute frame's messages are the control's (checked: trusted, that frame, our origin).
    if (this.control?.onMessage(event)) return;
    if (!this.tooltip || !fromExtensionFrame(event, this.tooltip.contentWindow, this.extensionOrigin)) return;
    const message = parseTooltipOut(event.data);
    if (!message) return;
    if (message.kind === "ready") {
      this.tooltipReady = true;
      if (this.pendingTooltip) this.toTooltip(this.pendingTooltip);
      this.pendingTooltip = null;
    } else {
      // A size for another card than the one shown now is stale.
      if (message.cardId !== undefined && message.cardId !== this.displayedCardId) return;
      // A size from an earlier showing of the same card (hidden and shown again) is stale too.
      if (message.seq !== undefined && message.seq !== this.cardSeq) return;
      this.tooltipSize = { width: Math.ceil(message.width), height: Math.ceil(message.height), shape: message.shape };
      if (message.cardId !== undefined) this.sizedCardId = message.cardId;
      this.updateTooltip();
    }
  };

  // ------------------------------------------------------------------ the tooltip
  private updateTooltip(): void {
    const card = this.shown;
    if (card && this.video && this.pointing()) {
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = null;
      this.showTooltip(card, this.video);
      return;
    }
    if (this.displayedCardId === null || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.shown && this.pointing()) return;
      this.hideTooltip();
    }, HIDE_DELAY_MS);
  }

  private showTooltip(card: ShownCard, video: HTMLVideoElement): void {
    if (this.tooltip && !this.tooltip.isConnected) {
      // The page removed it: make it again, and send the card again.
      this.tooltip = null;
      this.tooltipReady = false;
      this.displayedCardId = null;
      this.sizedCardId = null;
    }
    if (!this.tooltip) this.createTooltip();
    const frame = this.tooltip!;
    const picture = this.pictureOf(video);
    const cardRect: Rect = {
      left: picture.left + card.box.x * picture.width,
      top: picture.top + card.box.y * picture.height,
      width: card.box.width * picture.width,
      height: card.box.height * picture.height,
    };
    const toRect = (b: { x: number; y: number; width: number; height: number }): Rect => ({
      left: picture.left + b.x * picture.width,
      top: picture.top + b.y * picture.height,
      width: b.width * picture.width,
      height: b.height * picture.height,
    });
    // Off the cards around the hovered one, and below the player's top (a site's header).
    const playerTop = video.getBoundingClientRect().top;
    // Its own size, scaled down (shape kept) when the page has no room for it.
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // At the viewer's card size first; the fitting then keeps it inside and off the card.
    const requested = scaleTooltipSize(this.tooltipSize, this.cardScale);
    const fitted = fitTooltipSize(requested, viewport, playerTop);
    // A picture with no room beside the card is made smaller rather than laid over it.
    let size = this.tooltipSize.shape === "card" ? fitBesideCard(cardRect, fitted, viewport, playerTop) : fitted;
    // No breathing: a size within a few pixels of the shown one keeps the shown one while it still
    // fits: in the room, and (a picture) beside the card, as fitBesideCard would leave it, so the
    // space kept around the card is never eaten into.
    const room = availableSpace(viewport, playerTop);
    const shown = this.shownSize;
    const stillFits =
      shown.width <= room.width &&
      shown.height <= room.height &&
      (this.tooltipSize.shape !== "card" || sameSize(fitBesideCard(cardRect, shown, viewport, playerTop), shown));
    if (
      frame.dataset.shape === this.tooltipSize.shape &&
      Math.abs(size.width - shown.width) < SIZE_HYSTERESIS_PX &&
      Math.abs(size.height - shown.height) < SIZE_HYSTERESIS_PX &&
      stillFits
    ) {
      size = shown;
    }
    if (size.width !== this.shownSize.width || size.height !== this.shownSize.height || frame.dataset.shape !== this.tooltipSize.shape) {
      this.shownSize = size;
      frame.dataset.shape = this.tooltipSize.shape;
      frame.style.width = `${size.width}px`;
      frame.style.height = `${size.height}px`;
      frame.style.borderRadius = `${tooltipRadius(size, this.tooltipSize.shape)}px`;
    }
    // Stay where it is unless another place covers clearly less (no jumping between equals).
    let current = frame.style.visibility === "visible" ? { left: Number.parseFloat(frame.style.left), top: Number.parseFloat(frame.style.top) } : null;
    // The same card moved (the page scrolled, the player resized): the tooltip moves with it.
    if (current && this.placedFor && this.placedFor.cardId === card.cardId) {
      current = { left: current.left + cardRect.left - this.placedFor.rect.left, top: current.top + cardRect.top - this.placedFor.rect.top };
    }
    const at = placeTooltipAvoiding(
      cardRect,
      size,
      viewport,
      (card.others ?? []).map(toRect),
      playerTop,
      current && Number.isFinite(current.left) && Number.isFinite(current.top) ? current : null,
    );
    frame.style.left = `${at.left}px`;
    frame.style.top = `${at.top}px`;
    this.placedFor = { cardId: card.cardId, rect: cardRect };
    this.displayedCard = card;
    if (card.cardId !== this.displayedCardId) {
      this.displayedCardId = card.cardId;
      this.cardSeq += 1;
      this.toTooltip({ kind: "card", cardId: card.cardId, name: card.name, seq: this.cardSeq, ...(card.releaseId ? { releaseId: card.releaseId } : {}) });
    }
    // Shown once the tooltip has sized itself for this card; the outline comes with it.
    const ready = this.sizedCardId === card.cardId;
    frame.style.visibility = ready ? "visible" : "hidden";
    if (this.outline && !this.outline.element.isConnected) {
      this.outline = new CardOutline(this.tooltip!.parentElement ?? this.mountHost());
    }
    // The same box, on the same picture; nothing when the picture's size is not known.
    this.outline?.show(ready ? outlineRect(picture, card.box, video.videoWidth > 0 && video.videoHeight > 0) : null);
  }

  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.visibility = "hidden";
    if (this.displayedCardId !== null) this.toTooltip({ kind: "clear" });
    this.displayedCardId = null;
    this.sizedCardId = null;
    this.placedFor = null;
    this.outline?.hide();
  }

  private teardown(): void {
    this.shown = null;
    this.displayedCardId = null;
    this.sizedCardId = null;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    // No video: the gate is cleared, and the frame (going) hears nothing more.
    this.attachVideo(null);
    this.compute?.remove();
    this.compute = null;
    this.tooltip?.remove();
    this.tooltip = null;
    this.tooltipReady = false;
    this.pendingTooltip = null;
    this.outline?.remove();
    this.outline = null;
  }
}
