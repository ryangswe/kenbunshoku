<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

Changes a viewer can notice, newest first. Each released version links to its GitHub release,
which has the full notes and the download. Versions before 0.5.0 are described only in their
[GitHub releases](https://github.com/ryangswe/kenbunshoku/releases). Dates are in UTC.

## Unreleased

These changes are in open pull requests and are not in a release yet.

- Turning card hovers off and on in the popup after they were unloaded for being idle starts them
  again, as when the page opens: at once if the main video plays on a page where playing starts
  them. A tab in the background that had unloaded waits until it comes to the front.
  ([#44](https://github.com/ryangswe/kenbunshoku/pull/44))
- A change on hold would space analyses by what they cost on the viewer's computer, so that a slow
  computer is not kept busy analyzing. It waits for a change in the cardvision toolkit, and the
  plan is that it will not slow the looks the viewer is waiting on.
  ([#45](https://github.com/ryangswe/kenbunshoku/pull/45))

## 0.5.0 (2026-11-13)

[GitHub release](https://github.com/ryangswe/kenbunshoku/releases/tag/v0.5.0)

- A shown card now stays while the pointer stays on it, even after the card moves or another card
  is laid on top. To see the card on top, move the pointer off the card and back on. The popup has
  a new switch, Keep the card I'm pointing at, which is on unless you turn it off. Turned off, a
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
- A hovered card's picture no longer stays on its placeholder, or in English instead of the card
  language, after the settings are read again.
- The recognition engine now comes from the cardvision toolkit (0.13.0).
- With the pointer resting, the video's picture is read at most 60 seconds after the pointer last
  moved.
- Only messages the browser delivered from the extension's own frames are accepted.
- It ships the same recognition release as 0.4.1, B2.1, and asks for the same permissions. New
  sets still arrive as data updates, without a new version.
