<!-- SPDX-License-Identifier: Apache-2.0 -->
# Capturing the reel's footage

How the three captures behind the reel and the store images were made, on 2026-10-16 (UTC), with
the same commands, videos, times and pointer positions. Run everything from `media/reel/`.

*[Back to the reel](README.md)*

| Capture | Video | Where | Used for |
| --- | --- | --- | --- |
| `s3-hovers` | [ChinoizeCup #122](https://www.twitch.tv/videos/2899844921) (a community tournament played on a simulator) | paused at 9000 s | shots `m1-kaido`, `m3-nami`, `m5-xebec`; store screenshot 02 |
| `s5-hovers` | [Official Bandai regional, Bonn, Top 32 highlight](https://www.twitch.tv/videos/2596644493) (the One Piece Card Game Central channel) | paused at 9665 s | shots `m2-sanji`, `m4-mihawk`, `store-ace`; store screenshot 03 and both promo tiles |
| `s5-hero` | the same official video | playing from 9650 s | shots `hero`, `hero9` (the opening and the eye-button click) |

Past broadcasts can be taken down. If one is gone, pick another broadcast with a clear overhead
or simulator board, and choose new times, crops and cards (`scripts/shots.json`).

## Rules the captures keep

- **Signed out of Twitch:** no account, follows, chat or ad clicks. Decline non-essential cookies
  and leave the chat collapsed. Wait out ads; never click them.
- **Few page loads:** each video page once, where possible.
- **Crops:** only the board and play area reaches the reel. Crops leave out streamer faces and
  webcams, chat, channel names, usernames, player tags, game logs, sponsor graphics and Twitch's
  title bar and controls. The official broadcast is the one exception: its own overlay (player
  names, player cameras, event branding) stays, approved by the maintainer.
- **Check every hover by eye** (`scripts/verify-frames.py`): the card in the tooltip must be the
  card under the pointer. Use only cards with released English ids.
- **Keep `captures/` local.** It holds whole pages, so it is git-ignored and never committed.

## Setup

```bash
cd media/reel
npm install --no-workspaces
npx @puppeteer/browsers install chrome@152.0.7977.75     # Chrome for Testing; prints the binary's path
curl -LO https://github.com/ryangswe/kenbunshoku/releases/download/v0.1.0/kenbunshoku-0.1.0.zip
mkdir -p captures && unzip -q kenbunshoku-0.1.0.zip -d captures/ext && rm kenbunshoku-0.1.0.zip
node scripts/driver.mjs --chrome "<the Chrome for Testing binary>" --ext captures/ext/kenbunshoku-0.1.0
```

The driver opens a 1920×1080 Chrome window with Kenbunshoku 0.1.0 loaded and listens on
`localhost:8791`. Drive it from a second terminal with `scripts/k.sh`:

- `k.sh goto url=…` loads a page.
- `k.sh move x= y= ms=` moves the pointer smoothly; `k.sh click x= y=` moves and clicks.
- `k.sh wait ms=` holds the pointer still while logging it.
- `k.sh key k= mod=` presses a key.
- `k.sh eval js=…` runs JavaScript in the page.
- `k.sh shot path=` saves a screenshot.
- `k.sh tooltip` reports the card the tooltip shows; `k.sh button` reports where the eye button is.
- `k.sh rec/start name=` and `k.sh rec/stop` record a capture.
- `k.sh quit` closes the browser.

A recording writes `captures/<name>/frames/` (a CDP screencast, about 30 fps), `frames.jsonl` and
`mouse.jsonl` (every pointer position, on the same clock). The screencast has no cursor: the reel
draws it from `mouse.jsonl`.

`scripts/hoverseq.sh <name> <dwell ms> x,y …` records one capture that moves to each point in
turn, rests there, and logs the tooltip to `captures/<name>/hovers.jsonl`.

Positions below are page pixels in theatre mode at 1920×1080. The eye button sat at (1891, 75);
check it with `k.sh button` before clicking.

```bash
K=scripts/k.sh
# Run before seeking: wait out the ads until this prints false.
$K eval "js=/ad break|Ad \d of \d/.test(document.body.innerText)"
```

## 1. `s3-hovers`: the simulator board

```bash
$K goto url="https://www.twitch.tv/videos/2899844921?t=1h20m0s"
# decline non-essential cookies if asked; wait out the ads
$K move x=900 y=500 ms=300; $K key k=t mod=Alt                    # theatre mode
$K eval "js=(async()=>{const v=document.querySelector('video');v.currentTime=9000;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.pause();return v.currentTime})()"
$K move x=1000 y=1045 ms=200
$K click x=1891 y=75 ms=900                                         # the eye: card hovers on for this channel
scripts/hoverseq.sh s3-hovers 2200 688,155 912,310 920,462 1030,462 1145,462 768,635 880,635 1003,785 1115,785
python3 scripts/verify-frames.py captures/s3-hovers                # one crop per hover in captures/s3-hovers/verify/
python3 scripts/hover-times.py captures/s3-hovers                  # when each card's art appeared
```

The original run showed, in order: Charlotte Linlin, Rocks.D.Xebec (OP17-039), Kaido (OP17-042),
Streusen, Streusen, Nami (EB02-017), Shakuyaku, Luffy & Ace, and Thousand Sunny.

## 2. `s5-hovers` and `s5-hero`: the official broadcast

```bash
$K goto url="https://www.twitch.tv/videos/2596644493?t=2h0m0s"
# wait out the ads, then theatre mode
$K move x=900 y=500 ms=300; $K key k=t mod=Alt
# hide Twitch's title bar and player controls (they would sit over the broadcast's overlay)
$K eval "js=(()=>{const s=document.createElement('style');s.id='reel-hide';s.textContent='.video-player__overlay .top-bar,[data-a-target=player-controls]{visibility:hidden!important}';document.head.appendChild(s);return true})()"
$K click x=1891 y=75 ms=600                                         # card hovers on for this channel
$K eval "js=(async()=>{const v=document.querySelector('video');v.currentTime=9665;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));v.pause();return v.currentTime})()"
$K move x=960 y=1060 ms=200
scripts/hoverseq.sh s5-hovers 2200 1150,240 1160,390 1150,555 1375,550 855,830 850,340 870,500 855,665 655,690
python3 scripts/verify-frames.py captures/s5-hovers
python3 scripts/hover-times.py captures/s5-hovers
```

The original run showed, in order: Sabo, Portgas.D.Ace (PRB02-018) twice, Monkey.D.Luffy, Dracule
Mihawk (OP01-070), Sanji (OP06-119) twice, Monkey.D.Luffy, and a DON!! card.

The hero take records the click that turns card hovers on. Turn them off first, then play from
9650 s and record:

```bash
$K move x=1500 y=420 ms=300; $K click x=1891 y=75 ms=500          # hovers off again
$K move x=1000 y=500 ms=400
$K eval "js=(async()=>{const v=document.querySelector('video');v.currentTime=9650;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));await v.play();return v.currentTime})()"
sleep 1.5
$K rec/start name=s5-hero
$K wait ms=1400; $K move x=1500 y=420 ms=900; $K wait ms=600
$K click x=1891 y=75 ms=900                                         # on camera: the eye turns hovers on
$K wait ms=700; $K move x=1160 y=390 ms=1000; $K wait ms=4200     # rest on Portgas.D.Ace
$K tooltip
$K rec/stop
$K quit
```

## 3. Time the shots

`scripts/shots.json` gives each shot its capture, `start` (seconds from the capture's first frame),
length in frames and crop `[x, y, w, h]`. A new capture has new timings, so set each `start`
again from `hover-times.py`'s "reveal" column (the moment the card's art appeared):

- **Montage shots** (`m1` to `m5`): `start` = the card's reveal − 0.467 s, so that its art lands
  one beat (14 frames) into the shot. The original reveals were Kaido 6.94 s, Nami 15.93 s and
  Xebec 4.01 s in `s3-hovers`, and Mihawk 13.07 s and Sanji 15.85 s in `s5-hovers`.
- **Hero** (`hero`, `hero9`): `start` = the click's time in `s5-hero` (the `down` line of
  `mouse.jsonl`) − 4.51 s, so the click falls on the beat at 4.51 s. The Portgas.D.Ace art then has
  to land at 7.73 s into the reel, the music's hit (`T.reveal` = frame 232 in `src/timeline.ts`).
  In the original take the click was at 3.87 s and the art at 7.09 s. If yours differ, move the
  start until the art lands on frame 232 in `npm run studio`, and accept the click a little off
  the beat.
- **Store screenshot** (`store-ace`): any `start` in which the Portgas.D.Ace tooltip is shown and
  steady (4.6 s originally).

Then run `npm run footage` and go on with "Render the reel again" in [README.md](README.md).
