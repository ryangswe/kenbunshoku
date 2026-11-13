<!-- SPDX-License-Identifier: Apache-2.0 -->
# Changelog

Changes a viewer can notice, newest first. Each released version links to its GitHub release,
which has the full notes and the download. Versions before 0.5.0 are described only in their
[GitHub releases](https://github.com/ryangswe/kenbunshoku/releases).

## Unreleased

- Turning card hovers off and on in the popup after they were unloaded for being idle starts them
  again, as when the page opens: at once if the main video plays on a page where playing starts
  them. A tab in the background that had unloaded waits until it comes to the front. (#44, not
  merged yet.)
- Analyses will be spaced from what they cost on the viewer's computer, so a slow computer is not
  kept busy analyzing, without slowing the looks the viewer is waiting on. This waits for a
  change in the cardvision toolkit. (#45, not merged yet.)

## 0.5.0 (2026-11-13)

[GitHub release](https://github.com/ryangswe/kenbunshoku/releases/tag/v0.5.0)

- **Keep the card I'm pointing at.** A shown card stays while the pointer stays on it, even after
  the card moves or another card is laid on top. A new popup switch, on unless you turn it off,
  goes back to the earlier behavior, where a card laid on top replaced it after a moment.
- The recognition model loads when the main video plays on YouTube watch and live pages and on
  Twitch channel pages, past broadcasts and clips, instead of at the first hover. Loading reads no
  picture of the video, but it can download updated card data without a hover. Elsewhere it loads
  at the first hover, as before.
- In a browser with WebGPU, the card-feature check checks the card under the pointer first, and
  moving back onto a playing video starts a look at once.
- After 10 minutes with no pointer movement over the video and no card showing, card hovers are
  unloaded in that tab to free memory. The next pointer move over the video loads them again.
- A Card language menu in the popup picks the language of the card pictures.
- Tilted cards are hovered on the card itself, and the outline turns with the card.
- The recognition engine now comes from the cardvision toolkit (0.13.0).
- With the pointer resting, the video's picture is read at most 60 seconds after the pointer last
  moved.
- Only messages the browser delivered from the extension's own frames are accepted.
- The bundled card release (B2.1) and the permissions are the same as in 0.4.1.
