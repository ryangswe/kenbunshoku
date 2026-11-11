// SPDX-License-Identifier: Apache-2.0
// The compute frame's fixed session options. compute.ts spreads them into the toolkit's
// startComputeFrame; they live here, away from compute.ts's side effects, so a test can pass the
// same options to the vendored frame (test/session-options.test.ts).
import { SHOWN_HOLD } from "../../vendor/cardvision-browser/compute-session.js";

export const SESSION_OPTIONS = {
  // A shown card is kept through short gaps (two empty analyses in a row, or 5 s): no flicker on
  // a live stream.
  hold: SHOWN_HOLD,
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
} as const;
