// SPDX-License-Identifier: Apache-2.0
// What the toolkit's shared hover host is told about this extension (its `ProductConfig`): the tag
// of the frames' messages and of the outline's marker, the name for console lines, the video
// sites the config turns on, whether this is a development build, the two extension pages it
// makes as frames, the outline's colors, and that this extension's releases can carry the
// geometric stage. The content script, the compute frame and the tooltip frame each pass it with
// their build's `__DEV__`.
//
// It imports nothing from the host, so each realm checks it against its own host file's type.

import { CONFIG } from "../config.js";
import { OUTLINE_COLOR, OUTLINE_GLOW_COLOR, VIDEO_SITES } from "../constants.js";
import { TAG } from "./messages.js";

/** The compute frame and the tooltip frame, as paths inside the extension. */
export const COMPUTE_PAGE = "compute.html";
export const TOOLTIP_PAGE = "tooltip.html";

/** This build's config for the hover host. `dev`: a development build (also serves the local test
 *  page on http://127.0.0.1 and http://localhost). */
export function productConfig(dev: boolean) {
  return {
    tag: TAG,
    name: CONFIG.name,
    sites: { youtube: VIDEO_SITES.youtube, twitch: VIDEO_SITES.twitch },
    dev,
    frames: { compute: COMPUTE_PAGE, view: TOOLTIP_PAGE },
    outline: { edgeColor: OUTLINE_COLOR, glowColor: OUTLINE_GLOW_COLOR },
    // The geometric stage loads at the viewer's first pointer over the picture and checks only the
    // card under the pointer (the toolkit's GEOMETRIC_OPTIONS). Kenbunshoku's release can carry it.
    capabilities: { geometricStage: true },
  };
}
