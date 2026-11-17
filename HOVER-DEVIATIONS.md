<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hover deviations

The cardvision toolkit's hover spec (`vendor/cardvision-browser/hover-spec.json`, written out in
the toolkit's `docs/hover-spec.md`) asks each product to list every place where its hover differs
from the spec's clauses. For each one, the product gives the clause, what it does instead, and
whether the card game needs it or the difference is temporary. Under the spec, a difference that
is not listed is a defect.

Kenbunshoku runs on the toolkit's shared hover host (`host-content.js`, `host-compute.js` and
`host-settings.js`). The host owns the page policy, the frames and their lifecycle, the video
pick, the outline and the switches.

## Deviations

Kenbunshoku has none. It runs the spec's standard options. Its releases carry a geometric stage,
so the standard's `geometricScope: "focus"` and `geometricLoad: "pointer"` apply too (S-A3, S-C7,
S-C8 and S-W9). Kenbunshoku turns them on with `capabilities.geometricStage: true` in
`src/shared/product.ts`.

## What Kenbunshoku sets itself

The spec does not set these. They are listed here so that a reader comparing products can find
them in one place.

1. **The geometric stage's file and switches.** The stage itself is standard for a release that
   carries one. What is Kenbunshoku's own is how it is served and turned off. The stage checks
   recognized cards against their art's features with OpenCV.js, using a card-feature file of about
   60 MB on Kenbunshoku's CDN. The load request carries the file's address and pinned SHA-256, and
   the compute frame asks for persistent storage once it has started. The settings file can turn the
   stage off with `geometric: false`. On the One Piece test set, it raises the share of cards named
   right from 74.4% to 83.8% (see docs/accuracy.md).
2. **Localized card pictures.** The Card language menu picks the language of the card pictures,
   because the card game's publisher releases official pictures in some languages (French today).
   This uses the `localizedArt` settings, a picture chain that tries the localized picture first,
   the `{sourceFile}` maps and the settings file's `{sourceFile}` template variable, and an object
   URL that is reused only for the same picture. All of it sits inside the tooltip frame.
3. **Card shape.** The tooltip's placeholder keeps the One Piece card's 63 × 88 mm shape.
4. **Card numbers.** The printed-number pattern is in `kenbunshoku.config.json`.
5. **Outline color.** The outline is navy, as set in `kenbunshoku.config.json`.
6. **The tooltip's placement and size.** Kenbunshoku places and sizes its own tooltip, which
   shows the card picture or the card name only, with no details panel
   (`src/content/tooltip-view.ts`). The host shows and hides the tooltip, and the adapter decides
   its box.
7. **The popup.** The popup is Kenbunshoku's own. While card hovers are off, one disabled fieldset
   dims the other controls, and the keep-card switch keeps showing its stored value. The language
   menu is drawn again when the browser's language changes.

## Changes on moving to the shared host

Moving to the host made these hover behaviors standard. Each one used to work differently in
Kenbunshoku.

- **S-F3, a turned outline near the edge.** A turned card whose turned outline would reach past
  the picture used to get the upright box, clipped to the picture. It now gets the turned
  outline. The upright box is still used for an out-of-range turn, a bad side, or a side under
  4 px.
- **S-G3, Twitch pages.** `/following` and `/creatorcamp`, and clip addresses under those names,
  used to load at play like channel pages. They are now site pages, which load at the first
  pointer over the video.
- **S-A8, a video playing in a background tab.** It used to load the frames at once. It now waits
  until the tab comes to the front, and loads only if the main video is still playing then.
- **S-A7, switching card hovers on in a background tab.** Unless the frames had been removed for
  idleness, this used to load them at once on a page that loads at play. The load now always
  waits for the tab to come to the front.
- **S-H1, the switch at start-up.** A popup change made while the content script was still
  reading the switch could be overwritten by that read. The change now stands. An unreadable
  switch used to leave that tab off, and it now reads as on.
- **The tooltip frame removed by the page.** It used to be made again empty, and the card came
  back only when the compute frame named it again. Now the card on show, or held, is shown again
  as soon as the tooltip frame is made again.
- **S-A10 and S-G4, which `playing` events count.** A removed frame used to be made again only on
  the main video's own `playing` event. Any trusted `playing` event now picks the main video
  again, and makes the frames if that video is playing. A `playing` event from another video
  while the main one is paused still makes nothing.
- **S-G4, finding the video.** When no video was found, the page used to be searched again on
  every pointer event. The host keeps "no video" for up to one second, so a video that appears,
  or grows past 320 px, can be picked up to one second late on pointer moves. A trusted
  `playing` event, or leaving an active page, picks again at once.
- **S-H3, keep-card after the page removed the compute frame.** A keep-card change used to remake
  that frame, at once in a tab in front and when the tab came to the front in a background tab.
  Now nothing happens until the next trusted play or pointer, and the new frame reads the new
  value.

Three other changes are not visible to a viewer. The host sets no starting size for the tooltip
frame, so the adapter gives it a box when the frame is attached: 320 × 448 for the first frame,
and the size last shown for a frame made again. The card is placed again when the tooltip frame
says it is ready. The compute frame now asks for persistent storage after it has started, rather
than before.
