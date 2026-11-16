// SPDX-License-Identifier: Apache-2.0
// The tooltip frame as the content script drives it: the view adapter the toolkit's hover host
// calls (vendored host-content.js, `ViewAdapter`). The host makes the tooltip frame, keeps its
// visibility, stacking and pointer-events, moves it for full screen, checks every message from it,
// and decides when a card is shown and when it goes. This file decides the rest:
//
//   - how big the frame is: the tooltip's own size and shape, as the frame measured them for the
//     card it shows (a card-shaped picture, or a pill with the name), at the popup's card size,
//     fitted into the window below the player's top and beside the card, and kept as shown when
//     a new size is only a few pixels off (no breathing);
//   - where it goes: beside the card, off the other cards of the same look, and where it already
//     is unless another place is clearly better (geometry.ts, placeTooltipAvoiding); where it is
//     moves with the card when the same card moved on screen;
//   - what the frame is told: which card to show, numbered so that a late size from an earlier
//     card or showing is dropped, and to clear. A message is held until the frame says it is ready.
//
// The frame is shown, with the outline, only once it has measured itself for the card it shows,
// so it never shows a previous card or the wrong shape. Nothing here reads the page: the host
// hands over the picture, the card's box and the other cards in page coordinates.

import type { ShownCard, ViewAdapter, ViewFrame, ViewLayout } from "../../vendor/cardvision-browser/host-content.js";
import { parseTooltipOut, tag, type TooltipIn, type TooltipSize } from "../shared/messages.js";
import { availableSpace, fitBesideCard, fitTooltipSize, placeTooltipAvoiding, type Rect, scaleTooltipSize, tooltipRadius } from "./geometry.js";

/** A new fitted size closer than this to the shown one keeps the shown one (no breathing). */
export const SIZE_HYSTERESIS_PX = 8;
/** The tooltip's size before the frame has measured anything: a portrait card picture. */
export const INITIAL_SIZE: Readonly<{ width: number; height: number }> = Object.freeze({ width: 320, height: 448 });

type Shape = TooltipSize["shape"];

function sameSize(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  return a.width === b.width && a.height === b.height;
}

export class TooltipView implements ViewAdapter {
  readonly look = { title: "Card", shadow: "0 10px 30px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35)" };

  private frame: ViewFrame | null = null;
  /** The frame said it is ready: messages to it are posted, not held. */
  private ready = false;
  /** The last message for a frame that is not ready yet. */
  private pending: TooltipIn | null = null;
  /** The tooltip's own size (tooltip.ts), before it is fitted into the page. */
  private tooltipSize: TooltipSize = { ...INITIAL_SIZE, shape: "card" };
  /** The size it is shown at. */
  private shownSize: { width: number; height: number } = { ...INITIAL_SIZE };
  /** The shape the frame was last sized for; null for a new frame, so its first card sizes it. */
  private shape: Shape | null = null;
  /** The box the frame was last placed at; null for a new frame. */
  private placed: { left: number; top: number } | null = null;
  /** The viewer's card size (the popup's dial), as a factor of the tooltip's own size. */
  private cardScale = 1;
  /** The card the frame was told to show; null once cleared. */
  private displayedCardId: string | null = null;
  /** The card whose own size the frame has sent: it is shown only for that card. */
  private sizedCardId: string | null = null;
  /** Numbers each card message sent to the frame; its sizes echo it (stale ones are ignored). */
  private cardSeq = 0;
  /** Where the displayed card was when the frame was last placed, so the frame moves with it. */
  private placedFor: { cardId: string; rect: Rect } | null = null;

  /** The popup's card size changed (a percentage, already clamped). True when the factor changed:
   *  the caller then has the host place a card on show again (`relayout`). */
  setCardSize(percent: number): boolean {
    const scale = percent / 100;
    if (!(scale > 0) || scale === this.cardScale) return false;
    this.cardScale = scale;
    return true;
  }

  /** A new tooltip frame: nothing is known of it yet. It gets the size it was last shown at, as a
   *  card, so the tooltip page lays out at a card's size before its first card. */
  attach(frame: ViewFrame): void {
    this.frame = frame;
    this.forget();
    frame.place({ left: 0, top: 0, ...this.shownSize, cornerRadius: tooltipRadius(this.shownSize, "card") });
  }

  /** The frame is gone (hovers off, idle, removed by the page). */
  detach(): void {
    this.frame = null;
    this.forget();
  }

  /** What a frame that is gone or new does not carry over. The card size and the size last shown
   *  are the viewer's and the page's, and stay. */
  private forget(): void {
    this.ready = false;
    this.pending = null;
    this.shape = null;
    this.placed = null;
    this.displayedCardId = null;
    this.sizedCardId = null;
    this.placedFor = null;
  }

  /** A message from the tooltip frame, already checked by the host (trusted, from that frame, at
   *  the extension's origin). True when it is ready now, or sent its size for the card it shows:
   *  the host then shows the card again. */
  message(data: unknown): boolean {
    const message = parseTooltipOut(data);
    if (!message) return false;
    if (message.kind === "ready") {
      if (this.ready) return false;
      this.ready = true;
      const held = this.pending;
      this.pending = null;
      if (held) this.toTooltip(held);
      return true;
    }
    // A size for another card than the one shown now is stale.
    if (message.cardId !== undefined && message.cardId !== this.displayedCardId) return false;
    // A size from an earlier showing of the same card (hidden and shown again) is stale too.
    if (message.seq !== undefined && message.seq !== this.cardSeq) return false;
    this.tooltipSize = { width: Math.ceil(message.width), height: Math.ceil(message.height), shape: message.shape };
    if (message.cardId !== undefined) this.sizedCardId = message.cardId;
    return true;
  }

  /** Size and place the frame for `card`, and tell the frame which card it is. True once the frame
   *  has sent its size for this card: the host shows it then, with the outline. */
  show(card: ShownCard, layout: ViewLayout): boolean {
    const frame = this.frame;
    if (!frame) return false;
    const cardRect: Rect = layout.card;
    const { viewport, minTop: playerTop } = layout;
    const own = this.tooltipSize;
    // At the viewer's card size first; the fitting then keeps it inside and off the card.
    const fitted = fitTooltipSize(scaleTooltipSize(own, this.cardScale), viewport, playerTop);
    // A picture with no room beside the card is made smaller rather than laid over it.
    let size = own.shape === "card" ? fitBesideCard(cardRect, fitted, viewport, playerTop) : fitted;
    // No breathing: a size within a few pixels of the shown one keeps the shown one while it still
    // fits: in the room, and (a picture) beside the card, as fitBesideCard would leave it, so the
    // space kept around the card is never eaten into.
    const room = availableSpace(viewport, playerTop);
    const shown = this.shownSize;
    const stillFits =
      shown.width <= room.width && shown.height <= room.height && (own.shape !== "card" || sameSize(fitBesideCard(cardRect, shown, viewport, playerTop), shown));
    if (
      this.shape === own.shape &&
      Math.abs(size.width - shown.width) < SIZE_HYSTERESIS_PX &&
      Math.abs(size.height - shown.height) < SIZE_HYSTERESIS_PX &&
      stillFits
    ) {
      size = shown;
    }
    if (!sameSize(size, this.shownSize) || this.shape !== own.shape) {
      this.shownSize = size;
      this.shape = own.shape;
    }
    // Stay where it is unless another place covers clearly less (no jumping between equals).
    let current = layout.visible ? this.placed : null;
    // The same card moved (the page scrolled, the player resized): the frame moves with it.
    if (current && this.placedFor && this.placedFor.cardId === card.cardId) {
      current = { left: current.left + cardRect.left - this.placedFor.rect.left, top: current.top + cardRect.top - this.placedFor.rect.top };
    }
    const at = placeTooltipAvoiding(cardRect, this.shownSize, viewport, layout.others, playerTop, current && Number.isFinite(current.left) && Number.isFinite(current.top) ? current : null);
    frame.place({ left: at.left, top: at.top, ...this.shownSize, cornerRadius: tooltipRadius(this.shownSize, this.shape ?? "card") });
    this.placed = at;
    this.placedFor = { cardId: card.cardId, rect: { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: cardRect.height } };
    if (card.cardId !== this.displayedCardId) {
      this.displayedCardId = card.cardId;
      this.cardSeq += 1;
      this.toTooltip({ kind: "card", cardId: card.cardId, name: card.name, seq: this.cardSeq, ...(card.releaseId ? { releaseId: card.releaseId } : {}) });
    }
    return this.sizedCardId === card.cardId;
  }

  /** The card goes (the host has hidden the frame and the outline): the frame is told to clear. */
  hide(): void {
    if (this.displayedCardId !== null) this.toTooltip({ kind: "clear" });
    this.displayedCardId = null;
    this.sizedCardId = null;
    this.placedFor = null;
  }

  private toTooltip(message: TooltipIn): void {
    if (!this.frame || !this.ready || !this.frame.post(tag(message))) this.pending = message;
  }
}
