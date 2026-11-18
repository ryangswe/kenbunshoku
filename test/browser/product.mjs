// SPDX-License-Identifier: Apache-2.0
// Kenbunshoku's module for the toolkit's browser checks, vendored in
// vendor/cardvision-browser/harness/: the hover browser test (hover-browser.mjs), which CI runs in
// the "Hover browser test" job of .github/workflows/tests.yml, and the rollback check
// (rollback-check.mjs) take it with --product. It names this extension's config, frames, storage
// keys and debug global, the test settings file, and the cards of the harness's clip.

export default {
  name: "Kenbunshoku",
  /** The extension's config file, and the settings address in it (the stand-in serves that
   *  host). */
  config: new URL("../../kenbunshoku.config.json", import.meta.url),
  settingsUrl: (config) => config.settingsUrl,
  /** The repository root (--art must be outside it), and the unpacked build a run loads by
   *  default. */
  root: new URL("../../", import.meta.url),
  dist: new URL("../../dist", import.meta.url),
  /** The dev builds' debug global in the compute frame: { state, analyzed, ... }. */
  debugGlobal: "__kenbunshokuDebug",
  /** The outline's wrapper in the page. */
  outlineSelector: '[data-kenbunshoku="outline"]',
  /** The extension's two frames, and the tooltip frame's picture, picture box and name pill. */
  frames: { compute: "compute.html", tooltip: "tooltip.html" },
  /** An extension page that starts the background worker again when Chrome has stopped it. The
   *  popup does so because it asks the background to refresh the settings as it opens. */
  wakePage: "popup.html",
  tooltipIds: { img: "img", art: "art", pill: "pill" },
  /** The settings file the stand-in serves: no release pointer (the bundled release only), only the
   *  given picture address, no update notice, and the geometric stage off. */
  testSettings: (artTemplate) => ({
    schemaVersion: 1,
    updatedAt: "2026-11-13T00:00:00Z",
    namesOnly: false,
    primary: { id: "cdn", template: artTemplate },
    fallbacks: [],
    geometric: false,
  }),
  /** Where the settings file puts card pictures, relative to the settings host. */
  artPath: (art) => `/art/${art}`,
  /** The storage keys of the popup's switches. */
  keys: { enabled: "enabled", keepCard: "keepCard" },
  /** The cards of the clip: catalog ids, each with its picture file named in the release
   *  catalog. */
  cards: { A: "OP01-001", B: "OP05-060", C: "ST01-012", D: "OP03-122" },
  /** Card width in the clip, in pixels, and the card's height over its width. */
  cardWidth: 158,
  cardAspect: 88 / 63,
  /** The clip, and the card places inside it, as in the toolkit's example. A is on show for the
   *  whole clip, and D is laid on top of it from 8 s (a card covering the hovered one). B is on
   *  show for the whole clip. C is on show until 12 s, then picked up, and laid back in its place
   *  at 16 s, so that it arrives under a resting pointer with no seek (arrives-under-rest). */
  clip: { width: 1280, height: 720, fps: 15, seconds: 20 },
  places: {
    A: { x: 140, y: 250 },
    B: { x: 430, y: 250 },
    C: { x: 720, y: 250, until: 12, back: 16 },
    D: { x: 152, y: 262, from: 8 },
  },
  /** Checks expected to fail on this extension's code, each until the change named fixes it.
   *  None. */
  expectedFail: {},
  unsupported: {},
};
