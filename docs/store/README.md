<!-- SPDX-License-Identifier: Apache-2.0 -->
# Store images

The images uploaded to the store listings, kept here so that a new maintainer or a new listing
starts from the same files.

*[Back to README](../../README.md)*

| File | Size | Used on | What it shows |
| --- | --- | --- | --- |
| `01-screenshot-1280x800.png` | 1280×800 | Chrome Web Store, addons.mozilla.org | An official Bandai regional broadcast on Twitch, paused: a hover on Portgas.D.Ace (PRB02-018). Cropped to the play mat. |
| `02-screenshot-1280x800.png` | 1280×800 | Chrome Web Store, addons.mozilla.org | A community tournament broadcast played on a simulator, paused: a hover on Kaido (OP17-042). Cropped to leave out the mat's game logo. |
| `03-screenshot-1280x800.png` | 1280×800 | Chrome Web Store, addons.mozilla.org | The official regional broadcast, paused: a hover on Sanji (OP06-119). |
| `promo-small-440x280.png` | 440×280 | Chrome Web Store (small promo tile) | Drawn; the tooltip's card picture is the Portgas.D.Ace hover from the official broadcast. |
| `promo-marquee-1400x560.png` | 1400×560 | Chrome Web Store (marquee promo tile) | Drawn around a crop of the official broadcast's board during the Portgas.D.Ace hover. |
| `store-icon-128-padded.png` | 128×128 | Chrome Web Store (store icon) | The extension icon (`icons/icon-128.png`) with the padding the store asks for. |

How they were made:
- **Capture.** Past broadcasts on Twitch, viewed signed out with the extension running.
- **Cropping.** Twitch's page, chat and viewer webcams are cropped out. Each broadcast's own
  overlay (player names and cameras, event branding) is kept.
- **Hovers.** Each hover shown was checked by eye against the card under the pointer.

A fourth store screenshot, showing the in-player eye button, was retired with the button in 0.3.0
and is not kept.

**Not covered by this repository's license.** These images show One Piece Card Game card art and
tournament broadcasts as they appear on video. The art, the footage and the people in it belong to
their owners. Kenbunshoku is an unofficial fan project, not affiliated with Bandai.
