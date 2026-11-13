// SPDX-License-Identifier: Apache-2.0
// The compute frame's fixed session options. compute.ts spreads them into the toolkit's
// startComputeFrame; they live here, away from compute.ts's side effects, so a test can pass the
// same options to the vendored frame (test/session-options.test.ts).
import { READING_HOLD, SHOWN_HOLD } from "../../vendor/cardvision-browser/compute-session.js";
import type { KeyValueStorage } from "../settings/store.js";
import { readKeepCard } from "../shared/keep-card.js";

/** The options that do not depend on the viewer's settings (sessionOptions adds the hold). */
export const SESSION_OPTIONS = {
  // Named cards follow their own outline: a tilted card is hovered on the card itself, not on
  // the upright box around it, and its shown card carries the turned outline the content
  // script draws (toolkit 0.10.1). It costs one tilt estimate per detected card whose match
  // reaches the recognizer's threshold (tau), on the crop the card already has.
  rotatedOutlines: true,
  // On each analysis the geometric stage checks only the card under the pointer and the boxes
  // overlapping it, not every card in the picture, so the first card on a paused picture shows
  // sooner. A card the stage applies to and has not checked yet shows nothing until it is
  // checked. On a still picture the next analysis checks every card (toolkit #83), and the
  // repeats after it reuse that analysis (#89), so a later move to another card is answered from
  // it. Without the stage (no WebGPU) this changes nothing. It needs the session's pointer mode,
  // the default: another mode makes startComputeFrame throw.
  geometricScope: "focus",
  // The geometric stage (and its card-feature file, about 60 MB, downloaded once and then held in
  // memory per tab) loads when the viewer first points at the picture, not with the release when
  // the video plays (owner, 2026-11-12: "At the first hover"). A tab whose video plays but is never
  // pointed at holds no copy. Looks before the stage is ready run without it, as at any start.
  geometricLoad: "pointer",
  // Analyses are spaced from what they cost on this computer: the wait between looks lets
  // analysis take at most a quarter of the time (the toolkit's default share), never shorter than
  // the fixed cadence, so a slow computer is not kept busy analyzing (owner, 2026-11-12: both
  // products pace). The analysis time is measured within the session and not stored.
  measuredPacing: true,
} as const;

/**
 * The session options for the popup's "Keep the card I'm pointing at" switch (shared/keep-card.ts;
 * owner, 2026-11-12: on by default, with a switch to turn it off).
 *   - On: the reading hold. A shown card stays while the pointer stays where the card was seen,
 *     with no time limit, even after the card moves or another card is laid on top; a card the
 *     pointer moves onto replaces it. Once two looks in a row show the card gone from there, the
 *     frame marks it `held` and the content script hides the outline but keeps the tooltip.
 *   - Off: the shown hold. A shown card is kept through short gaps (two empty analyses in a row,
 *     or 5 s), so that it does not flicker on a live stream, and a card laid on top replaces it
 *     after a moment with no pointer move.
 */
export function sessionOptions(keepCard: boolean) {
  return { ...SESSION_OPTIONS, hold: keepCard ? READING_HOLD : SHOWN_HOLD } as const;
}

/** The session options for the switch as stored when the compute frame starts. A storage that
 *  cannot be read gives the default (on). A change remakes the frame (agent.ts), so the hold
 *  never changes under a running session. */
export async function storedSessionOptions(storage: Pick<KeyValueStorage, "get">) {
  return sessionOptions(await readKeepCard(storage).catch(() => true));
}
