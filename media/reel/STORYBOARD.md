# Kenbunshoku launch reel: storyboard

For the launch post on X (2026-10-16), made with Kenbunshoku 0.1.0: it shows the in-player eye
button, which 0.3.0 removed. How to remake it: [README.md](README.md). 16:9 1920x1080 (`Reel`) and a 9:16 1080x1920 cutdown (`Cutdown`) on
the same timeline; 30 fps; 26.53 s (796 frames). Every product pixel is a screen capture of the real
extension (the 0.1.0 release zip) running on Twitch past broadcasts in
Chrome for Testing. Drawn on top: the cursor (from the logged pointer path; the screencast has no
cursor), click rings, one highlight ring on the eye button, captions, window frames, source tags,
the end card.

**Story in one line:** a card on a stream you can't read; one click on the eye; rest the pointer
and the official art lands on the music's hit; then digital boards and a real table in quick
succession; the name.

| Reel time | Frames | Shot | Picture | Caption |
|---|---|---|---|---|
| 0.00–4.50 | 0–135 | Hero (physical, official Bandai regional broadcast) | Overhead feature-match table with the broadcast's own overlay (player names, leaders), full-bleed; fade in; the cursor appears and heads for the player's top-right corner; a navy ring pulses round the eye button for the last bar | "Can't read that card?" |
| 4.50 | 135 | | The real click on the in-player eye button (on a beat), click ring | "Click the eye once." (from 4.27) |
| 4.50–7.74 | 135–232 | | The cursor travels to Portgas.D.Ace on the table and rests; the extension's loading card, then | |
| **7.74** | **232** | **Mic drop** | **the art lands (Portgas.D.Ace PRB02-018) on the track's hit**, a small kick | "Hover a card on stream." |
| 9.53–11.37 | 286–341 | | The hit's 2-bar ring-out: slow push-in on the tooltip | "See the official art." |
| 11.37–13.20 | 341–396 | Digital | Kaido OP17-042 (blue vs green/red board), framed window | "Digital boards and real tables." |
| 13.20–15.00 | 396–450 | Physical (official) | Sanji OP06-119 | (same) |
| 15.00–16.83 | 450–505 | Digital | Nami EB02-017 (green/red side of the blue vs green board; no EB05 cards in frame) | "On Twitch and YouTube." |
| 16.83–18.63 | 505–559 | Physical (official) | Dracule Mihawk OP01-070 | (same) |
| 18.63–20.43 | 559–613 | Digital | Rocks.D.Xebec OP17-039 | (same) |
| 20.43–26.53 | 613–796 | End card | On the final hit: **Kenbunshoku**; "Free and open source · Chrome extension"; `github.com/ryangswe/kenbunshoku`; under them, small but readable, "Unofficial fan project, not affiliated with Bandai."; fade to black with the music | |

Each montage card's art lands one beat into its shot; every cut is on a bar line.

## Claims and style

- No "any", "every", "all", "first", "only", accuracy numbers or other tools named (the simulator is not named either).
  "On Twitch and YouTube" is what the extension supports; the footage itself is Twitch only.
- Dark navy-black, with the outline's navy as the only accent (`#1b2f6b` edge, `rgb(61,111,224)` glow).
  No violet branding, no One Piece logos or Bandai trade dress drawn by us; card art appears only
  inside the extension's tooltip and on the captured boards. The extension's icon (violet) is left out.

## Privacy

Every shot is cropped by `scripts/build-footage.py` before it reaches the Remotion project, to the
board/play area only: no streamer faces or webcams, no chat, no channel names, usernames, player
tags, game logs, sponsor graphics or Twitch title bar/controls. Exception approved by the maintainer: the
official Bandai broadcast keeps its own overlay (player names, player cams, event branding); the Twitch
title bar and controls were hidden on the page and cropped out. Each source clip is under 2 s on
screen except the hero (about 11 s of the official feature table). Which streams, times and crops
the shots came from: [CAPTURE.md](CAPTURE.md) and `scripts/shots.json`.

## Music cut list

Track: "Sports" by tatamusic on Pixabay, `tatamusic-sports-sports-music-569203.mp3` (98.66 s; README.md, "Music"). Tempo ~131.9 BPM (one
bar = 1.8195 s), found by autocorrelating the onset envelope and checked against the strong onsets
at 14.99, 18.66, 25.90 and 89.56 s.

**The "mic drop"** is at **source 15.02 s**: the level jumps from -17.7 dB to -4.7 dB RMS within
50 ms (a single hit), then rings out and falls to about -29 dB by 17.8 s, with nothing else
playing (a 2-bar drop-out), before the main section lands at 18.63 s. Found with
`scripts/analyze-music.py` (RMS per 23 ms, spectral-flux onsets, and a search for a strong onset
followed by a large level drop in the next 0.3–1.5 s). There is a second, weaker
hit-and-decay at 47.74 s, unused.

| Section | Source | Reel | What it is |
|---|---|---|---|
| A | 0.000–4.040 | 0.000–4.040 | the opening: bars 1–2 of the first intro phrase |
| B | 11.318–25.870 | 4.040–18.592 | bars 3–4 of the second intro phrase, the hit (15.02 -> 7.74), its 2-bar ring-out, the drop (18.63 -> 11.35), 4 bars of the main section |
| C | 89.533–97.474 | 18.592–26.533 | the last bar of the second main section, the track's final hit (91.34 -> 20.40, onset 20.45), its natural decay |

- Joins: 30 ms equal-power crossfades centred on each splice, placed just before the bar's onset
  (A->B skips exactly 4 bars, B->C skips exactly 35 bars, so the groove is unbroken).
- Ending: the track's own last hit and decay, plus a fade-out from reel 24.80 s to the end (26.53 s).
- Loudness: -14 LUFS integrated (two-pass loudnorm, linear), true peak about -2.6 dBFS.
- To adjust by ear: change `CUTS`, `FADE_START` or `TOTAL` in `scripts/make-audio.mjs`; picture
  sync points are in `src/timeline.ts` (`T.reveal` = the hit, `T.drop`, `T.end` = the final hit).
