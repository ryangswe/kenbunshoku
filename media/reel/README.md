<!-- SPDX-License-Identifier: Apache-2.0 -->
# Launch reel

The 26.5 s video for Kenbunshoku's launch post (2026-10-16), and everything needed to make it
again. It is a [Remotion](https://www.remotion.dev/) project of its own, separate from the extension's
build.

*[Back to README](../../README.md) · [Store images](../../docs/store/README.md)*

| File | What it is |
| --- | --- |
| `final/reel-16x9.mp4` | the reel, 1920×1080, 30 fps, H.264 + AAC |
| `final/reel-9x16.mp4` | the vertical cut, 1080×1920, same timeline |
| `final/poster.png`, `final/poster-9x16.png` | frame 300 of each (the first card's art on the board) |

The reel shows Kenbunshoku **0.1.0**, which turned card hovers on per channel with an eye button in
the player. 0.3.0 removed that button (hovers are always on), so the reel's second caption, "Click
the eye once.", no longer matches the current version.

## How it is made

Every product pixel is a screen capture of the real extension running on Twitch past broadcasts.
Nothing in the extension's picture is redrawn. The steps:
1. **Capture.** `scripts/driver.mjs` runs Chrome for Testing with the 0.1.0 extension loaded and
   records a screencast (and every pointer position) while the pointer moves over a paused or
   playing video. [CAPTURE.md](CAPTURE.md) lists the exact videos, times and pointer positions.
2. **Footage.** `scripts/build-footage.py` cuts each shot from a capture, crops it to the board, and
   writes `public/footage/<shot>.mp4` with a pointer track. The crops leave out streamer faces,
   chat, channel names, usernames and Twitch's own controls.
3. **Music.** `scripts/make-audio.mjs` cuts three sections of the track on its bar lines and
   normalizes the loudness to -14 LUFS, writing `public/audio/reel.wav`.
4. **Render.** Remotion renders the 16:9 and 9:16 compositions without sound (`src/Reel.tsx`, with
   cuts and captions timed in `src/timeline.ts`). Remotion draws the pointer, click rings, captions,
   frames and end card on top of the footage. Then `scripts/mux.mjs` adds the music and writes the
   posters.

[STORYBOARD.md](STORYBOARD.md) has the shot list, the music cut list and the rules the reel keeps:
no "any", "every", "all", "first" or "only" claims, no accuracy numbers, no other tools named, and
"Unofficial fan project, not affiliated with Bandai." on the end card.

`public/footage/` is committed: steps 2 to 4 run from this folder alone. Only a new capture
(step 1) needs Twitch.

## Requirements

- Node.js 22 or later, with npm.
- ffmpeg with libx264 (`brew install ffmpeg` on macOS).
- Python 3 with Pillow, to remake the store images (`pip install pillow`). `scripts/analyze-music.py`
  also needs NumPy.
- macOS, to get the same text: the captions use the system font (San Francisco) and the store
  images use Helvetica Neue. Elsewhere the reel renders with a fallback font.
- The music track (below).

## Render the reel again (from the committed footage)

```bash
cd media/reel
npm install --no-workspaces
# put the track at public/audio/tatamusic-sports-sports-music-569203.mp3 (see "Music")
npm run render     # out/reel-16x9.mp4, out/reel-9x16.mp4, out/poster.png, out/poster-9x16.png
```

`npm run render` runs `npm run audio`, then `npm run render:frames` (both compositions, without
sound), then `npm run mux`. To preview and scrub the timeline, use `npm run studio`.

## Remake everything from new captures

1. Make the three captures: [CAPTURE.md](CAPTURE.md). They land in `captures/`, which git ignores.
   Raw captures show whole pages (chat, faces, names), so never commit them.
2. Set each shot's `start` in `scripts/shots.json` from the new capture's timings, as CAPTURE.md
   explains, then run `npm run footage` (or name the shots to rebuild:
   `python3 scripts/build-footage.py m1-kaido`).
3. Render the reel as above, and check every hover by eye: the card under the pointer must be the
   card in the tooltip.
4. Store images: `npm run store` renders screenshot 01 from the `Store` composition, then draws
   02, 03 and the two promo tiles from the captures into `out/store/`. Frame numbers in
   `scripts/make-store-assets.py` belong to the original captures: after a recapture, pick the
   matching frames from `captures/<name>/verify/`. The store icon is not made here. It is
   `icons/icon-128.png` drawn at 96 px in 16 px of transparent padding, as the Chrome Web Store
   asks; `docs/store/store-icon-128-padded.png` is the uploaded file.

To change the edit:
- **Cuts and captions:** `src/timeline.ts` (`T`, `MONTAGE`, `CAPTIONS`). Keep cuts on bar lines:
  one bar is 54.6 frames.
- **Music sections and fade:** `CUTS`, `FADE_START` and `TOTAL` in `scripts/make-audio.mjs`.
- **Look:** `src/theme.ts` and `src/components/`.

## Music

"Sports" by tatamusic, from Pixabay (track 569203; file name
`tatamusic-sports-sports-music-569203.mp3`, 98.66 s). It is used under the
[Pixabay Content License](https://pixabay.com/service/license-summary/). That license allows using
the track in a video, but not sharing the audio file on its own, so neither the track nor the
edited `reel.wav` is in this repository. Download the track from Pixabay into `public/audio/`.

Before posting a new cut of the reel, check two things on the track's Pixabay page: the license as
it stands that day, and whether the track is registered with YouTube Content ID. Some Pixabay tracks
are, and those can draw claims when the video is reposted.

## Licenses

- **Code** in this folder (`src/`, `scripts/`, the configuration files): Apache-2.0, like the rest
  of the repository.
- **The videos, posters and footage** (`final/`, `public/footage/`) are not covered by the Apache
  License. They show One Piece Card Game card art and tournament broadcasts as they appear on
  video, which belong to their owners, along with the people in them. The soundtrack is the Pixabay
  track above. Kenbunshoku is an unofficial fan project, not affiliated with Bandai.
- **Remotion** has its own license: free for individuals and small teams, while larger companies
  need a company license. See [remotion.dev/license](https://www.remotion.dev/license).
