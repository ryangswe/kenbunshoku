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
| The popup's settings are grayed out while card hovers are off | unit tests in `popup.test.ts` | the look of the popup |
| A second tab of the same page uses the browser's cache | browser test `cached-reload` | none |
| After 10 idle minutes the model is unloaded, and a hover loads it again | browser test `idle-unloads`, `loop-no-reload`, `idle-reload-on-hover` (with a 6-second idle time) | the real 10 minutes |
| Turning hovers off and on after an idle unload loads at once | browser test `switch-on-after-idle-reloads` (an expected failure until it is fixed) | none |
| Which YouTube and Twitch pages load at play (watch, live, channel, past broadcast, clip; not embeds or Twitch's front page) | unit tests in `agent.test.ts` (`play:` tests) | on the real sites |
| No request leaves for any host but the settings host | browser test network scope (every Chrome process; Chrome's own sign-in and update traffic to Google's hosts, which no page or extension starts, is exempt and listed in the report) | none |
| The geometric stage (WebGPU) checks and corrects cards | none: CI has no accelerated WebGPU | yes, on a Mac |
| The video plays as smoothly as without the extension | none | yes |
| A still card's tooltip and outline do not jitter | none | yes |
| Firefox | none | yes |

## Planned, not covered yet

These behaviors are on the list for automatic checks but are not in the browser test yet. Until
they are, unit tests cover part of them and the rest stays by hand.

- A tab in the background with a changed setting is made again once, with the latest setting,
  when it comes to the front (unit tests in `agent.test.ts`).
- Leaving a YouTube watch page while its mini player goes on stops reading the video (by hand).
- The video element replaced, the player moved for full screen, a letterboxed picture, and a
  capture still pending when the frames are removed (unit tests in `agent.test.ts`, in part).
- Replies from a compute frame that was replaced are ignored (unit tests in `agent.test.ts`).
- Keep the card I'm pointing at changed while the model loads (by hand).
- The geometric stage becoming ready during a session, with a move onto a card it has not
  checked while another analysis runs (by hand, on a Mac with WebGPU).
- A card picked up from under a resting pointer (the clip has one; not asserted yet).

