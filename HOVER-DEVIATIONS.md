<!-- SPDX-License-Identifier: Apache-2.0 -->
# Hover deviations

This page lists every place where Kenbunshoku's hover differs from the standard setup in the
cardvision toolkit's hover spec (`vendor/cardvision-browser/hover-spec.json`, written out in the
toolkit's `docs/hover-spec.md`). Each entry names the spec clause, what Kenbunshoku does instead
and one reason:

- **game:** the One Piece Card Game needs it;
- **temporary:** the difference goes away with a named change.

Under the spec, a difference that is not listed here is a defect.

Kenbunshoku runs on the toolkit's shared hover host (`host-content.js`, `host-compute.js` and
`host-settings.js`). The host owns the page policy, the frames and their lifecycle, the video
pick, the outline and the switches. So everything the spec covers there is standard, and the
entries below are about what Kenbunshoku adds through its product config and its tooltip.

## Deviations

1. **The geometric stage** (game). Kenbunshoku's releases carry a geometric stage. It checks
   recognized cards against their art's features with OpenCV.js, using a card-feature file of
   about 60 MB on the CDN. The load request carries its address and pinned SHA-256, and the
   compute frame asks for persistent storage once it has started. The settings file can turn it
   off with `geometric: false`. On the One Piece test set it raises the share of cards named
   right from 74.4% to 83.8% (see docs/accuracy.md). Kenbunshoku turns it on with
   `capabilities.geometricStage: true`.
2. **`geometricScope: "focus"`** (game). On each analysis, the stage checks the card under the
   pointer, and the boxes overlapping it, first. The host adds this only for a product with the
   geometric stage, so it exists only because of entry 1.
3. **`geometricLoad: "pointer"`** (game). The card-feature file loads at the first pointer over
   the video, not when the video plays. The host adds this together with entry 2, and it too
   exists only because of entry 1.
4. **Localized card pictures** (game). The Card language menu picks the language of the card
   pictures, because the card game's publisher releases official pictures in some languages
   (French today). This uses the `localizedArt` settings, a picture chain that tries the localized
   picture first, the `{sourceFile}` maps, and an object URL that is reused only for the same
   picture. All of it sits inside the tooltip frame.
5. **Card shape** (game). The tooltip's placeholder keeps the One Piece card's 63 × 88 mm shape.
6. **Card number rule** (game). The printed-number pattern and the `{sourceFile}` template
   variable in `kenbunshoku.config.json`.
7. **Outline color** (game). Navy, set in `kenbunshoku.config.json`, as the product's own color.
8. **Tooltip placement and size** (temporary). Kenbunshoku places and sizes its own tooltip,
   which shows the card picture or the card name only, with no details panel
   (`src/content/tooltip-view.ts`). The host shows and hides it, and the adapter decides its box.
   This stays per product until the toolkit offers a shared tooltip.
9. **The popup** (temporary). The popup is Kenbunshoku's own. One disabled fieldset dims the
   other controls while card hovers are off, the keep-card switch keeps showing its stored value
   then, and the language menu is drawn again when the browser's language changes. It stays per
   product until the toolkit offers a shared popup.

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
  idleness, this used to load them at once. The load now always waits for the tab to come to the
  front. On a page that loads at the pointer, it waits for a pointer.
- **S-H1, the switch at start-up.** A popup change made while the content script was still
  reading the switch could be overwritten by that read. The change now stands. An unreadable
  switch used to leave that tab off, and it now reads as on.
- **The tooltip frame removed by the page.** It used to be made again empty, and the card came
  back only when the compute frame named it again. The card on show, or held, is now shown in
  the new frame straight away.
- **S-A10 and S-G4, which `playing` events count.** A removed frame used to be made again only on
  the main video's own `playing` event. Any trusted `playing` event now picks the main video
  again, and makes the frames if that video is playing. A `playing` event from another video
  while the main one is paused still makes nothing.
- **S-G4, finding the video.** When no video was found, the page used to be searched again on
  every pointer event. The host keeps "no video" for up to one second, so a video that appears,
  or grows past 320 px, can be picked up to one second late on pointer moves. A trusted
  `playing` event, or leaving an active page, picks again at once.
- **S-H3, keep-card in a background tab.** If the page had removed the compute frame, a
  keep-card change made behind used to remake that frame when the tab came to the front. Now
  nothing happens until the next trusted play or pointer, and the new frame reads the new value.

Other changes are not visible to a viewer:
- the tooltip is given a box when its frame is attached, because the host sets no starting size:
  320 × 448 for the first frame, and the size last shown for a frame made again;
- the card is placed again when the tooltip frame says it is ready;
- the compute frame asks for persistent storage after it has started rather than before.
