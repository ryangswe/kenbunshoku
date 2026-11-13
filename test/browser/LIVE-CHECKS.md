<!-- SPDX-License-Identifier: Apache-2.0 -->
# Live checks and what covers them

Before a release, the maintainer checks a test build by hand on real videos. This table lists those
steps and, for each one, the automatic check that now covers it, if any. A step with no automatic
check is still done by hand.

The hover browser test is `test/browser/hover-browser.mjs`. It runs in CI on every pull request,
with a synthetic clip on a local page, so it never sees YouTube, Twitch, real footage or the real
CDN. Unit tests are the vitest files in `test/`.

| Step done by hand | Covered by | Still by hand |
| --- | --- | --- |
| The model loads when the video plays, before any hover | browser test `frames-at-play` | on YouTube and Twitch pages |
| Nothing is read from the video before the pointer comes over it | browser test `no-capture-before-pointer` | none |
| Hovering a card shows its picture at once | browser test `art-visible` (time to the picture is reported) | on real footage, at real network speed |
| The outline marks the hovered card | browser test `outline-shows` | tilted cards, cards near the edge |
| Moving off the video clears the tooltip | browser test `move-off-clears` | none |
| A card laid on top doesn't replace the one you point at | browser test `covered-kept` | none |
| Its outline goes while the picture stays | browser test `held-outline-hides` | none |
| With the switch off, the card on top replaces it | browser test `switch-flips` | none |
| Moving off a card and back on shows the card on top | none | yes |
| The outline goes after about 10 s of rest on a playing video | none | yes |
| A page's own made-up pointer events do nothing | browser test `fake-pointer-ignored`; unit tests in `agent.test.ts` | none |
| Card hovers off: no frames, nothing read or fetched | browser test `off-means-off` | none |
| Card hovers on again while a video plays: it loads at once | browser test `on-while-playing-loads` | none |
| The popup's settings are greyed out while card hovers are off | unit tests in `popup.test.ts` | the look of the popup |
| A second tab of the same page uses the browser's cache | browser test `cached-reload` | none |
| After 10 idle minutes the model is unloaded, and a hover loads it again | browser test `idle-unloads`, `loop-no-reload`, `idle-reload-on-hover` (with a 6-second idle time) | the real 10 minutes |
| Turning hovers off and on after an idle unload loads at once | browser test `switch-on-after-idle-reloads` (an expected failure until it is fixed) | none |
| Which YouTube and Twitch pages load at play (watch, live, channel, past broadcast, clip; not embeds or Twitch's front page) | unit tests in `agent.test.ts` (`play:` tests) | on the real sites |
| No request leaves for any host but the settings host | browser test network scope (every Chrome process) | none |
| The geometric stage (WebGPU) checks and corrects cards | none: CI has no accelerated WebGPU | yes, on a Mac |
| The video plays as smoothly as without the extension | none | yes |
| A still card's tooltip and outline do not jitter | none | yes |
| Firefox | none | yes |
