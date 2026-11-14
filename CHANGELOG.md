<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

Changes a viewer can notice, newest first. Each released version links to its GitHub release,
which has the full notes and the download. Versions before 0.5.0 are described only in their
[GitHub releases](https://github.com/ryangswe/kenbunshoku/releases). Dates are in UTC.

## Unreleased

Nothing yet.

## 0.6.0 (2026-11-14)

[GitHub release](https://github.com/ryangswe/kenbunshoku/releases/tag/v0.6.0)

- Turning card hovers off and on in the popup after they were unloaded for being idle starts them
  again, as when the page opens: at once if the main video plays on a page where playing starts
  them. A tab in the background that had unloaded waits until it comes to the front.
  ([#44](https://github.com/ryangswe/kenbunshoku/pull/44))
- On a slower computer, the looks that keep a shown card fresh are spaced by what they cost there,
  aiming for looking to take about a quarter of the time. While the pointer moves, the wait
  between those looks is at most 4 seconds. A look the viewer waits on is not held back: while the
  pointer moves over a playing video, the next look starts early enough that the card it names
  stays showing, unless a single look takes longer than that allows. On a slow computer, a card
  that arrives under a resting pointer can take up to about 4 seconds to show.
  ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- In a browser with WebGPU, when the pointer is on a card of a playing video that the card-feature
  check has not confirmed yet, the next look for it starts at most every half second instead of
  every quarter second. ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- If the recognition model finishes loading after the 10 seconds that follow the pointer's last
  move, while the pointer still rests over the video, Kenbunshoku looks once then, still within 60
  seconds of that move. If that look finds no card, it waits for the pointer to move. A new tab
  whose model loads slowly can now name the card under a resting pointer.
  ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- While a look that got no answer waits to be tried again, no other look starts unless a pointer
  move or tap puts the pointer on a different card. Moving within the same card waits for the
  retry.
  ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- After the site moves to a page where card hovers do not run (for example from a YouTube video to
  the home page, with the video playing on in a small player), a pointer resting over that player
  no longer leads to a picture being read. Before, this was checked only when the pointer moved.
  ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- If the page removes Kenbunshoku's frames, they are made again when the main video next starts
  playing, on pages where playing starts card hovers, as well as at the next pointer move over the
  video. ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- A `playing` event made up by a page script no longer starts loading card hovers; only the
  browser's own event does. ([#53](https://github.com/ryangswe/kenbunshoku/pull/53))
- It runs on the cardvision toolkit 0.14.0rc2. It ships the same recognition release as 0.5.0,
  B2.1, and asks for the same permissions.

## 0.5.0 (2026-11-13)

[GitHub release](https://github.com/ryangswe/kenbunshoku/releases/tag/v0.5.0)

- A shown card now stays while the pointer stays on it, even after the card moves or another card
  is laid on top. To see the card on top, move the pointer off the card and back on. The popup has
  a new switch, **Keep the card I'm pointing at**, which is on unless you turn it off. Turned off, a
  card laid on top replaces the shown one after a moment, as in earlier versions.
- The recognition model loads when the main video plays on YouTube watch and live pages and on
  Twitch channel pages, past broadcasts and clips, instead of at the first hover. Loading reads no
  picture of the video, but it uses memory, also in a background tab or on a video with no cards,
  and it can download updated card data without a hover. The card-feature file of about 60 MB
  still waits until you first point at a video. Elsewhere card hovers load at the first hover, as
  before.
- In a browser with WebGPU, the card-feature check checks the card under the pointer and the cards
  overlapping it, instead of every card in the picture, so that card shows sooner. On a paused
  video it then checks the other cards too.
- Moving the pointer back onto a playing video starts a look at once.
- While the pointer rests where no card is showing, Kenbunshoku looks every 2 seconds instead of
  once or twice a second, so a card that appears under the resting pointer can take a little over
  2 seconds to show.
- After 10 minutes with no pointer movement over the video and no card showing, card hovers are
  unloaded in that tab to free memory. The next pointer move over the video loads them again.
- A Card language menu in the popup picks the language of the card pictures.
- Tilted cards are hovered on the card itself, and the outline turns with the card.
- The tooltip flickers less on live streams, and on a slow computer the first card gets more time
  to show.
- A hovered card's picture no longer stays on its placeholder after the settings are read again,
  and no longer stays in English when the pictures in the card language arrive while it loads.
- The recognition engine now comes from the cardvision toolkit (0.13.0).
- With the pointer resting, the video's picture is read at most 60 seconds after the pointer last
  moved.
- Only messages the browser delivered from the extension's own frames are accepted.
- It ships the same recognition release as 0.4.1, B2.1, and asks for the same permissions. New
  sets still arrive as data updates, without a new version.
