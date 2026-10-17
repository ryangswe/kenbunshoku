<!-- SPDX-License-Identifier: Apache-2.0 -->
# Kenbunshoku

A Chrome extension for watching One Piece Card Game videos. Rest the pointer on a card in a
YouTube or Twitch video, and the card's picture appears beside it, enlarged. The picture may be a
different printing of the recognized card.

**Kenbunshoku is an unofficial fan project, not affiliated with Bandai.** The One Piece Card
Game, its card names and its card art belong to their owners.

**Kenbunshoku is published as an unmaintained community example, looking for a maintainer,
with no ongoing support or update schedule.** The author may publish occasional updates (an
update for EB-05 is planned), but future set coverage is not guaranteed. If you would like to
take it on, [get in touch](https://github.com/ryangswe/kenbunshoku/issues).

- Runs on supported YouTube and Twitch pages: YouTube watch pages, live pages and embedded
  players served from `www.youtube.com` (including those frames on other websites, without
  reading the surrounding website), and Twitch live channels and past broadcasts on
  `www.twitch.tv`. Other embedding addresses, such as `youtube-nocookie.com` or
  `player.twitch.tv`, are not supported.
- No streamer setup is needed. It recognizes supported cards from the video picture, in your
  browser.
- Hover only: it shows a card when you point at one, and stays out of the way otherwise. It can
  leave uncertain matches blank. It can also miss cards or show an incorrect match.

## Install

For now it is installed from a zip file; a Chrome Web Store listing is planned. It takes a few
minutes.

1. Open the project's [releases page](https://github.com/ryangswe/kenbunshoku/releases) and,
   under the newest release, download the file named `kenbunshoku-<version>.zip`.
2. Unzip it: double-click the file on a Mac, or right-click it and choose **Extract All** on
   Windows. You get a folder named `kenbunshoku-<version>`. Move that folder somewhere it can stay,
   for example your Documents folder. Chrome loads the extension from it each time it starts, so
   do not delete it.
3. In Chrome, open a new tab, type `chrome://extensions` in the address bar and press Enter.
4. Turn on **Developer mode**, the switch in the top right corner of that page.
5. Click **Load unpacked**, the button that appears at the top left.
6. Choose the `kenbunshoku-<version>` folder from step 2 (the folder itself, not a file inside
   it) and click **Select**.
7. Kenbunshoku appears in the list. To keep its button in view, click the puzzle-piece icon to
   the right of the address bar, then the pin beside **Kenbunshoku**.

Chrome may show a notice about extensions in developer mode when it starts. That is normal for
an extension installed this way; choose to keep it.

Every install from a release zip has the same extension ID (`igfdjmpikcbplijnlpkligaafepgoaaa`).
That alone does not keep settings: they are kept only when you update in place, as below.

**To update and keep your settings**, download the new zip and unzip it, replace the contents of
your existing Kenbunshoku folder with the contents of the new one, then click the circular
**Reload** arrow on Kenbunshoku's card in `chrome://extensions`. When a newer version is out,
Kenbunshoku's popup says "New version available" with a link.

**To remove it**, click **Remove** on its card in `chrome://extensions`. Removing the extension
deletes its saved settings (the on/off switch and the channels you turned card hovers on for);
installing it again starts fresh.

## Use

Open a One Piece Card Game video on YouTube or Twitch and move the pointer over the video. A
small round Kenbunshoku button appears in the player's top-right corner: click it to turn card
hovers on for that channel (on YouTube, for that video when no channel is shown, as in an embedded
player). Kenbunshoku remembers the channels you turned on. Video analysis and the card-feature
download start only after you turn card hovers on. The extension separately checks its settings
file when it is installed or updated and when Chrome starts, and at most once an hour while you
use it. Click the button again to turn card hovers off for that channel; that forgets it.

Then rest the pointer on a face-up card. After a moment a thin outline marks the card it recognized,
and its picture appears beside it, placed off the cards around it where it can (smaller when the
window is short). Move to another card to see that one, even one under the picture shown: the
pointer passes through it, and nothing on it can be clicked. When there is no picture, the
card's name shows instead. Pausing works too, on recorded videos and on live streams.

Kenbunshoku's toolbar popup is one switch, the main on/off: turned off, it shows no button in
the player and analyzes no video, on any page, until you turn it back on. It does not stop the
settings check above. Below it are two links, to the project page and to the open-source toolkit
it is built on.

The first time you point at a video with card hovers on in a tab, the recognition model starts, which takes a
moment. Recognition runs only while the pointer is over the video, and stops by itself 10 seconds after
you stop moving it, unless a card is showing under the resting pointer. It stops at once when
the pointer leaves the video or the tab goes to the background.

A card face down, a card mostly covered, or a picture too small or too blurred may show
nothing: Kenbunshoku leaves uncertain matches blank. It can also miss cards or show an incorrect
match.

**Extra accuracy (WebGPU).** On a computer whose Chrome has WebGPU, Kenbunshoku is designed to
also check each card against the card art's shapes, which tells close-looking cards apart
better. The check runs only when it loads successfully and stays on: it turns itself off when it
fails or is too slow. For it, Kenbunshoku downloads a card-feature file of about 60 MB from
`cdn.kenbunshoku.com` on first use (the first video you turn card hovers on for) and caches it in
Chrome's storage; it is downloaded again if that storage is cleared or the file changes. Without
WebGPU it works without the extra check. Each tab
in which you have hovered a video holds its own copy of the card features in memory, about
60–70 MB, until the tab is closed or navigates away.

Known limitation: on a Twitch channel that shows a Twitch Extension over the video, that
extension's frame takes the pointer, and Kenbunshoku sees no pointer there.

Known limitation: a scene cut without a seek is caught at the next analysis, not at once, so a
card can stay up to a second or two after the picture under it changes.

## How well it works

The models were measured once, before release, on 25 frames of 13 public videos from 9
recording groups that were not used in training (2 on a digital client, 7 of physical play).
"Named right" is the share of readable card faces under the pointer for which the right card
was shown; "wrong of shown" is the share of the cards shown that were wrong, counting a card
shown over a card back or an empty part of the table as wrong. In brackets, 95% intervals
over recording groups.

These are held-out Python evaluation results for B2, not a held-out test of the shipping browser
extension. B2.1, the release the extension ships, has the same models and vector bank, with one
catalog entry corrected and the identity grouping that follows from it.

| | Named right | Wrong of shown |
| --- | --- | --- |
| B2 models only — Python evaluation | 221/297 = 74.4% (50.3–83.8) | 9/230 = 3.9% (1.6–11.8) |
| B2 + geometric stage — Python evaluation | 249/297 = 83.8% (62.5–91.8) | 7/256 = 2.7% (0.6–10.3) |

In the extension, the first row corresponds to running without WebGPU, and the second to the
extra-accuracy check on WebGPU. That mapping is intended behavior: it holds when the check loads
successfully and stays on.

The held-out geometric-stage results above were measured in Python. The browser implementation
of the check was compared with Python on development data only, not on the held-out set. On
generated development scenes, named-right rates were 74.76% in both implementations;
wrong-of-shown was 3.07% in Python and 2.94% in the browser. On the faces whose input was
byte-identical on both sides, all 622 final hover answers agreed. However, the stricter
pre-registered intermediate-parity check did not pass: vote-count and match agreement were
78.04% and 91.17%, below the 95% requirement. The maintainer chose to enable the browser check
on WebGPU despite that failed check. These development results do not establish the browser
extension's held-out accuracy. A diagnostic of the recorded evidence found the vote and match
differences only on faces whose ORB descriptors differ between the native OpenCV build and
OpenCV.js; on 12 faces examined in detail, the cause was ORB's keypoint angle, which the two
builds round differently by under 0.01 degrees. That cause is shown for those 12 faces and is
the working explanation for the rest.

Speed: in the development check's browser run (Chrome with WebGPU on an Apple M3 Max, the 23
real development frames at their native size), whole-frame analysis with the check took
1073.3 ms at the 95th percentile. That was measured after the models and the card-feature file
had loaded, so it leaves out startup and the download; the first frame analyzed is included. It
is one machine and a small sample, not a promise of delay on other computers. The check turns
itself off where it is too slow.

**Limits.**

- **A small test.** 25 frames from 9 recording groups, so the intervals are wide.
- **Physical play is well below digital.** With the models only, 68/124 physical faces were
  named right against 153/173 digital ones; with the geometric stage, 84/124 and 165/173 (both
  Python evaluation). Webcam and phone footage is the hardest.
- **SAMPLE-stamped art and DON!! cards.** Most official images of set and starter cards, which
  the models compare against, carry a "SAMPLE" overprint that physical cards do not, and the
  many DON!! art variants count as one card.
- **Missing cards.** Some cards and promotional printings are missing: 13 promotional cards in
  the list have no official art and no other printing, so they are not recognized, and coverage
  of promotional cards is incomplete.
- **Different printings.** A match names the card; the picture shown may be a different printing
  of it.
- **Incorrect matches remain possible**, especially on difficult physical footage.
- **New sets.** What an installed Kenbunshoku recognizes is the card list in its release.
  This release covers Bandai's official English card list up to OP-17 and EB-04, with the starter
  decks up to ST-36 and the premium boosters PRB-01 and PRB-02. New sets require an extension
  update and are not supported until included in a release; publishing an official list does not
  update an installed extension. Future updates are not guaranteed (an EB-05 update is planned;
  there is no ongoing update schedule). Cards from sets not yet supported (for example pre-release
  reveals in deck builders and simulators) usually show nothing, but can be mistaken for a
  different supported card of similar colors and layout.

The model card has every figure, the comparisons written down before the test (frozen in the
maintainers' private records before any held-out frame was scored; not a public
pre-registration), and the caveats: https://huggingface.co/JuicyKaraageNo1/kenbunshoku-onepiece.

## Privacy

- **No accounts, analytics, telemetry or advertising.**
- **Video frames are never uploaded.** Pictures of the video are analyzed inside your browser,
  by the extension itself, temporarily in memory; they are not saved to storage.
- **Three kinds of requests, to two hosts:** the settings file, from `cdn.kenbunshoku.com`, when
  the extension is installed or updated and when Chrome starts, then at most once an hour while
  you use it; a card's picture, when a card is shown, from `cdn.kenbunshoku.com` or, when that
  fails, from `optcgapi.com`; and, with WebGPU, a card-feature file of about 60 MB from
  `cdn.kenbunshoku.com`, downloaded on first use (the first video you turn card hovers on for,
  never at install) and cached. These requests carry no cookies, no account ID or per-user
  tracking identifier, and not the address of the page you watch. Like any web request, they
  show the host your IP address and which file was asked for.
- **Stored on your computer only:** the on/off switch, the channels you turned card hovers on
  for (each with the time you turned it on), the last settings file, which update
  notice you dismissed, and the card-feature file.

[PRIVACY.md](PRIVACY.md) has the details.

### Permissions

| Permission | Why |
| --- | --- |
| Read and change your data on `www.youtube.com` and `www.twitch.tv` | On supported pages, the extension shows its button in the player and reads the page's address or channel link to know the channel. It reads the video's picture only on channels you turned card hovers on for, and only around your pointer activity over the video, and shows the card beside it. The permission also covers `www.youtube.com` player frames embedded in other websites; the surrounding website is not read. |
| `cdn.kenbunshoku.com`, `optcgapi.com` | To load the settings file, card pictures and the card-feature file. |
| Storage and unlimited storage | Storage keeps the on/off switch, the channels you turned card hovers on for, the last settings file and a dismissed update notice, on your computer. Unlimited storage lets the extension keep its approximately 60 MB card-feature cache without the normal quota and eviction limits. It does not give the extension access to any other website. |

No access to other sites, your tabs or your history.

## How it works

The extension is built on an open-source card recognition runtime,
`cardvision-browser` (Apache-2.0; see [Built on cardvision](#built-on-cardvision)), and a One
Piece Card Game release of its models: a detector that finds cards in the picture and a
recognizer that matches each card against a bank of known cards, with an accept rule that shows
nothing when the match is not clear.

- The **content script** (`src/content/`) runs in YouTube and Twitch pages. It follows the
  page's main video and the pointer over it, and captures a picture when asked.
- A hidden **compute frame** (`src/compute/`), an extension page inside the video page, hosts
  the runtime's worker. It decides when to analyze a picture (only around pointer activity,
  with the runtime's scheduler), and which card a tooltip shows at the pointer (the runtime's
  hover rule). Pictures go from the content script to this frame only.
- The **tooltip frame** (`src/tooltip/`), an extension page placed beside the card, shows its
  picture alone (320 px wide, scaled down to fit the window but not below 200 px), or its name
  when there is no picture. It takes no pointer events.
- The **background** (`src/background/`) fetches the settings file.
- The runtime's **geometric stage** (WebGPU only) checks each recognized card against its art's
  ORB features, using OpenCV.js and a packed card-feature index on the CDN. The compute frame
  passes the bundled stage settings (`data/geometric.json`, which names the index's manifest)
  and the manifest's pinned SHA-256 (`kenbunshoku.config.json`); the worker downloads the index after
  the release has loaded, keeps it in the Cache API, checks every shard's SHA-256, and turns
  the stage off by itself when it is too slow or fails. The compute frame asks the browser to
  keep that storage (`navigator.storage.persist()`).

### The settings file

Where pictures come from is decided by a small settings file at
`https://cdn.kenbunshoku.com/config.json` (schema version 1), so that images can be switched to
another source, or off, without a new extension release:

- `namesOnly: true` shows no pictures at all: the card's name only.
- `geometric: false` (optional; absent means on) turns the extra-accuracy stage off: the
  card-feature file is not downloaded, from the next page a video is hovered on.
- `primary` is the project's own image server; `fallbacks` are tried in order when it fails
  (an error, a body that is not a picture, or no picture within 5 seconds); with none left, the
  tooltip shows the card's name.
- `cardLink` is obsolete: the tooltip has no link. A file may still carry it; it is ignored.

The file is checked strictly. A file that cannot be used leaves the last good copy in effect, or
the copy built into the extension. An image source on a host the extension has no permission
for is ignored (adding a host needs a new release). The extension also reads an optional
`update: { "latest": "x.y.z", "url": "https://…" }` field: when the running version is lower,
the popup shows one dismissible "New version available" line. The address must be on the
project's releases page; any other is ignored.

## Build from source

Node 22 or later.

```
npm ci
npm test
npm run build -- --release <release folder> --images-index <images.jsonl>
```

- `--release` is a release folder of the recognition models as the runtime's
  `cardvision build-release` writes it (`release.json` and the files it pins). The build checks
  it with the runtime's own verification (every file against its SHA-256 and size, the parts
  against each other) and copies it into `dist/release/`. Release files are never committed.
- `--images-index` (optional) is the card picture mirror's index (JSON Lines with `file` and
  `url`), from which the file-name map of the `optcgapi` fallback is built afresh. Without it,
  the build uses the committed copy, `data/source-files.json` (card ids and file names only),
  which `node scripts/source-map.mjs --catalog <catalog.json> --images-index <images.jsonl>`
  regenerates.
- `--dev` makes a development build that also runs on the local test page.

The result is `dist/`, an unpacked extension: load it with **Load unpacked** as above.

- Builds carry the public key in `keys/unpacked-public.pem` as the manifest's `key`, which fixes
  the extension ID of unpacked installs. `--store` leaves it out, for a Chrome Web Store upload
  (the store assigns its own ID). The private key is not in this repository.
- The models' license, notice and provenance (`release-legal/`) are copied beside them into
  `dist/release/`; the build fails without them.
`npm run package` zips a release build into `kenbunshoku-<version>.zip` for a release page.

### Maintainer notes

- **The card-art CDN** (`cdn.kenbunshoku.com`: card images and the settings file) is published
  from `cdn/` with `cdn/opcdn.py` (plan, publish, verify; credentials from `cdn/.env`, never
  committed). [cdn/README.md](cdn/README.md) has the setup and the steps;
  [cdn/SETTINGS.md](cdn/SETTINGS.md) is the settings file's contract, and `cdn/config.json` is
  both the published settings and the extension's built-in default.

- `kenbunshoku.config.json` holds the extension's names, sites, image hosts, settings address,
  printed-number rule, geometric pin and links; `scripts/fork-config.mjs` explains and checks it.
- A new image host needs an extension release: the settings file can only name hosts in the
  config's `imageHosts`, which become the manifest's host permissions and the extension pages'
  `connect-src`.
- The settings file's `update.url` must lie under the config's `updateUrlPrefix`.
- TODO (each new set): when a release adds a set, update the set line in the "New sets" bullet of
  the Limits list under "How well it works" (today OP-17, EB-04, ST-36, PRB-02).
- TODO (unpublished addresses): the cardvision toolkit's repository, its adapt guide and the
  runtime's source are not public yet. When they are, link them from "Built on cardvision", the
  "Make it yours" steps, "The runtime" and `NOTICE` (the cardvision-browser upstream). The
  models' `release-legal/` already points at "Built on cardvision", so it needs no change.

### The runtime

`vendor/cardvision-browser/` holds the runtime's built modules at the commit recorded in its
`VENDOR.json`, with its license and notice. To update it:

```
node scripts/vendor-runtime.mjs --repo <path to a cardvision toolkit checkout> --commit <sha> \
    --opencv <folder with the runtime's OpenCV.js build>
```

It builds the runtime from that commit in a temporary folder (its own `npm ci` and `npm run
build`) and copies the result here. OpenCV.js (`opencv.mjs`, `opencv_js.wasm`, their
`opencv.mjs.LEGAL.txt`) is built by the runtime's `scripts/build-opencv.mjs`, which git does not
keep; `--opencv` names that build, which must match the commit's `opencv.lock.json` (recorded in
`VENDOR.json`). ONNX Runtime Web's WebAssembly files are not vendored; the
build copies them from this repository's `onnxruntime-web` dependency, which must be the version
`VENDOR.json` names.

### Manual check on a local video

A dev build runs on a local test page that plays a video file you name. No footage is kept in
this repository.

```
npm run build -- --dev --release <release folder> --images-index <images.jsonl>
npm run manual -- --video /path/to/clip.mp4
```

Load `dist/` in Chrome, open the address it prints (`http://127.0.0.1:8770/`), and rest the
pointer on a card.

`test/smoke/smoke.mjs` does the same headlessly in Chrome for Testing and prints the cards it
was shown (see the comment at its top; it needs `puppeteer-core`, which is not a dependency).

## Make it yours: an extension for another card game

Kenbunshoku is Apache-2.0. Its recognition is not specific to One Piece: the models, the bank
and the card list all come from the release folder. What makes this build Kenbunshoku (its
names, sites, hosts, addresses and the rule for printed numbers) is in one file,
`kenbunshoku.config.json`. The build checks it and refuses a file with a problem, saying which.
To make the same extension for another card game, copy this repository, edit that file, add
your release and its legal files, and build.

**You need:**

- a release folder for your game, as the cardvision toolkit's adapt guide makes it
  (`cardvision build-release`; check it with `cardvision verify-release`, which prints its
  16-hex-digit id). The toolkit and its guide are being released separately: see
  [Built on cardvision](#built-on-cardvision);
- the license, notice and provenance of your models;
- either a web host for your card pictures, **for pictures you have the right to serve**, or
  nothing: the extension can show names only.

These steps were checked on the runtime's toy release (20 cards): with names only, the
extra-accuracy stage off, no host at all and Twitch only, the copy's tests passed, it built, and
in Chrome for Testing on the local test page it named the cards under the pointer, requesting
nothing beyond the local server.

1. **Copy the repository, then `npm ci` and `npm test`.** The tests read
   `kenbunshoku.config.json`, so they stay green as you change it. Tests of Kenbunshoku's own
   values (its ID, its CDN, its release) are skipped in a copy whose `packageName` is not
   `kenbunshoku`. One test fails until you change both the `packageName` (step 2) and the
   extension's key (step 6): a copy must not keep one of Kenbunshoku's and not the other.

2. **Edit `kenbunshoku.config.json`.** Its keys are explained at the top of
   `scripts/fork-config.mjs`. In short:
   - `name`, `shortName`, `description`: your extension's names (manifest, popup, store);
     `packageName`: the release zip's name.
   - `icons`: a folder holding `icon-16.png`, `icon-32.png`, `icon-48.png` and `icon-128.png`
     (`node scripts/icons.mjs` redraws Kenbunshoku's).
   - `videoSites`: `{ "youtube": true|false, "twitch": true|false }`. The manifest's sites
     and the pages the extension's frames accept follow it.
   - `imageHosts`: every host the extension may request (card pictures, the settings file,
     the card-feature index). They become its host permissions and the only hosts its pages
     may connect to. `[]` for none.
   - `settingsUrl`: the address of your hosted settings file, or `null`: the extension then
     fetches nothing and uses the copy built into it (step 4).
   - `printedNumber`: how the number printed on a card is found, available to image addresses
     as `{printedId}`: `{ "regex": "…" }` (its first capture group,
     matched on the card id), `"catalog"` (an optional `printed` field on each card in your
     catalog), or `"none"`.
   - `outlineColor` and `outlineGlowColor` (optional): the hovered card's outline, a solid edge
     and the glow fading out around it, as CSS colors (defaults `"#1b2f6b"` navy, `"rgba(61, 111, 224, 0.6)"` blue).
   - `geometric`: the extra-accuracy stage, or `null` for off (step 5).
   - `projectUrl` and `runtimeUrl`: the popup's two links (keep `runtimeUrl`: it credits the
     runtime). `updateUrlPrefix`: where a "New version available" line may link, or `null`
     for never. `modelUrl`, `maintainerContactUrl`: yours, or `null`.

3. **Your models.** Pass your release folder to the build with `--release`. Rewrite
   `release-legal/` for your models: `LICENSE` (your models' license), `NOTICE`, whose first
   line must contain `(id <your release id>)` (the build refuses any other release), and
   `PROVENANCE.md` (what the models were trained and built from). Release files are never
   committed. The card's name (the picture's alt text, and what shows without a picture)
   comes from the release's catalog. Replace `data/source-files.json` with `{}` (it maps One Piece cards to
   file names on `optcgapi.com`) and build without `--images-index`.

4. **Card pictures: choose one.** `cdn/config.json` is the settings file built into the
   extension, used when no fetch has succeeded (always, with `settingsUrl` `null`).
   - **Names only.** Set `"namesOnly": true`, `"primary": null`, `"fallbacks": []`,
     and `"geometric": false`. The tooltip then shows each card's name.
   - **Your own image host.** Follow [cdn/SETTINGS.md](cdn/SETTINGS.md), the settings file's
     contract. Serve each picture at a path made from the catalog's `art` value (for example
     `https://<your host>/art/{art}`), serve `config.json` beside it with
     `Access-Control-Allow-Origin: *`, set `primary` to that template and drop the `optcgapi`
     fallback. Put the host in `imageHosts` and the file's address in `settingsUrl`.
     `cdn/opcdn.py` publishes to Cloudflare R2 ([cdn/README.md](cdn/README.md)); read its
     guards before you reuse it, since they name other projects. Any static host that serves
     the same files works too.

5. **Extra accuracy (the geometric stage), on or off.**
   - **Off:** `"geometric": null` in the config. The build then needs no
     `data/geometric.json` (delete it), asks for no unlimited storage and ships no OpenCV.
   - **On:** `geometric.settings` names the stage's settings file; choose yours on data you do
     not test on (adapt guide, tier 2, step 7). Build the card-feature index from the bank in
     your release, `cardvision build-features --config <settings> --catalog <catalog> --art
     <card images> --bank <your release's bank> --pin`, and pack it with
     `cardvision pack-features --index <index> --out <folder> --config <settings>`. Host the
     folder on a host in `imageHosts` and never change what it holds. Set the settings file's
     `index.path` to the address of its `manifest.json`, and `geometric.manifestSha256` to that
     file's SHA-256. A dev build can point at a local copy with `--geo-manifest-url`. An index
     built for another bank is refused, and the stage turns itself off.

6. **Your own extension ID.** Builds carry `keys/unpacked-public.pem` as the manifest's `key`,
   which fixes the ID of unpacked installs. Do not reuse it: make your own key pair, keep the
   private key out of the repository, and commit the public one. The ID follows from it.

   ```
   openssl genrsa -out private-key.pem 2048
   openssl rsa -in private-key.pem -pubout -out keys/unpacked-public.pem
   ```

   A `--store` build leaves the key out; the Chrome Web Store assigns its own ID.

7. **Delete the One Piece text** that no longer applies: this README (its figures in "How well
   it works" are for the One Piece models only: measure your own), `PRIVACY.md` (rewrite it
   for your hosts), and `cdn/README.md` if you do not use `cdn/opcdn.py`. Keep `LICENSE` and
   the attributions in `NOTICE`, and add your own.

8. **Build, load and check on a local video.** Use a video file of your own game:

   ```
   npm test
   npm run build -- --dev --release <your release folder>
   npm run manual -- --video /path/to/clip.mp4
   ```

   In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**
   and choose `dist/`. Open the address the server prints (`http://127.0.0.1:8770/`), turn card
   hovers on with the button in the player, and rest the pointer on a card.
   `test/smoke/smoke.mjs` does the same headlessly (see "Manual check on a local video"). Then
   try a video on the sites you turned on. A release build is the same command without
   `--dev`, and `npm run package` zips it.

9. **Before a store listing.** Build with `--store` and package that. Explain every permission,
   as in "Permissions" above, and describe what is requested from which host, in the listing's
   privacy section. Say plainly that the extension is unofficial and not affiliated with your
   game's publisher, keep the publisher's logos out of your name and icon, and show only
   pictures you have the right to serve. Read the store's current policies yourself: this
   repository has not been through a store review.

## Built on cardvision

Kenbunshoku runs the Apache-2.0 cardvision browser runtime (`cardvision-browser`), vendored as
built modules in [vendor/cardvision-browser/](vendor/cardvision-browser/) with its license and
notice. The cardvision toolkit (training, the labeling tools and the runtime's source) is being
released separately, and this section will link it then. The One Piece Card Game models are on
[Hugging Face](https://huggingface.co/JuicyKaraageNo1/kenbunshoku-onepiece).

## License

Apache-2.0: see [LICENSE](LICENSE) and [NOTICE](NOTICE). The One Piece Card Game models shipped
in a build are Apache-2.0 too; see [release-legal/](release-legal/). Third-party licenses are in
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) and `vendor/cardvision-browser/`.

## Credits

Card recognition by the open-source `cardvision-browser` runtime
([Built on cardvision](#built-on-cardvision), Apache-2.0) and the
One Piece Card Game models trained with cardvision ([release-legal/](release-legal/)), on
[ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT). Card artwork belongs to its
rights holders; images are delivered through the project's CDN, with
[optcgapi.com](https://optcgapi.com) as a fallback.
