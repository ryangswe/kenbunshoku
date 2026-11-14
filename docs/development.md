<!-- SPDX-License-Identifier: Apache-2.0 -->
# Development

Building the extension from source, updating the vendored runtime, checking it on a local video, and maintainer notes.

*[Back to README](../README.md)*

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

The result is `dist/`, an unpacked extension: load it with **Load unpacked**, as in [Install from a release zip](install-from-zip.md).

- Builds carry the public key in `keys/unpacked-public.pem` as the manifest's `key`, which fixes
  the extension ID of unpacked installs. `--store` leaves it out, for a Chrome Web Store upload
  (the store assigns its own ID). The private key is not in this repository.
- The models' license, notice and provenance (`release-legal/`) are copied beside them into
  `dist/release/`; the build fails without them.

`npm run package` zips a release build. A build with the key becomes `kenbunshoku-<version>.zip` for a
release page, with every file inside one `kenbunshoku-<version>/` folder (the folder a user selects in
"Load unpacked"). A `--store` build becomes `kenbunshoku-<version>-store.zip` with `manifest.json` at the
zip's top level, as the Chrome Web Store requires. It refuses a dev build. It also refuses a
`.json`, `.js`, `.mjs`, `.css` or `.html` file of 4.5 MiB or more (`scripts/package-size.mjs`):
addons.mozilla.org refuses an add-on with such a file of 5 MiB, and the card data grows with every
set. The check is per file, and binary files (the WebAssembly, the ONNX models) never count;
`npm run build` warns about such files, so a dev build still works.

## Firefox

The same sources build for Firefox (desktop; 148 or later):

```
npm run build -- --target firefox --release <release folder>        # the addons.mozilla.org build
npm run build -- --target firefox --dev --release <release folder>  # dev: also the local test page
npm run package                                                    # kenbunshoku-<version>-firefox.zip
```

Only the manifest differs (`firefoxManifest` in `scripts/manifest.mjs`):

- the background module runs as a background script (Firefox has no service worker);
- no `key` and no `minimum_chrome_version`;
- a `gecko` block with the add-on ID (`firefoxAddonId` in `kenbunshoku.config.json`, permanent
  once listed; a dev build uses `kenbunshoku-dev@kenbunshoku.com`, so it loads beside the listed
  add-on), the minimum Firefox version and the data declaration (`required: ["none"]`: nothing
  about the user leaves the browser).

The minimum is 148, the first Firefox with `location.ancestorOrigins`: the compute and tooltip
frames read it to know the page they are in, and do not start without it. Permissions are the
Chrome manifest's. The version is the Chrome build's: both stores ship the same number, which the
settings file's release pointer compares with `minimumExtensionVersion`. The popup never shows the
"New version available" line in Firefox, which installs only signed add-ons and updates them
itself (`__TARGET__`, set by the build, is `"chrome"` or `"firefox"`; compare it at the use site).

The geometric stage needs WebGPU; where Firefox has none, the stage reports itself off and the
other stages work as before.

Code that runs in Firefox uses only `chrome.storage` and `chrome.runtime`. Before using another
`chrome.*` API, check MDN's compatibility table for Firefox 148. The background is an event page:
it may stop when idle, so it keeps no state outside storage.

To try a build: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/manifest.json`.
Before an upload: unzip the package and run `npx web-ext lint --source-dir <folder>` (0 errors),
then `node scripts/firefox-source-archive.mjs --release <folder> --runtime-repo <toolkit checkout>`
for the source archive Mozilla's reviewers rebuild from (the bundles are minified). Unzip the
archive into an empty folder, run `./build-firefox.sh`, and `diff -r` the unzipped
`out/kenbunshoku-<version>-firefox.zip` against the unzipped upload: every file must match.

## The runtime

`vendor/cardvision-browser/` holds the runtime's built modules from one toolkit commit, with its
license and notices: the worker and the runtime, and the toolkit's entries for extensions
(`compute-session.js` for the compute frame, `page-capture.js` for the content script,
`remote-release.js` for remote releases; their contract is the toolkit's
`docs/extension-session.md`), their TypeScript declarations, OpenCV.js for the geometric stage, and
`hover-spec.json`, the index of the toolkit's hover spec. `cardvision-vendor.json` records the
toolkit version and commit, the ONNX Runtime pin and each file's SHA-256. The toolkit's own tool
writes the folder; see "Vendoring the runtime, and checking it" in the toolkit's
`browser/README.md`. To update it, in a clean toolkit checkout at the commit:

```
mkdir -p <toolkit>/browser/vendor/opencv
cp vendor/cardvision-browser/opencv.mjs vendor/cardvision-browser/opencv_js.wasm \
   vendor/cardvision-browser/opencv.mjs.LEGAL.txt <toolkit>/browser/vendor/opencv/
(cd <toolkit>/browser && npm ci && npm run build)
npm --prefix <toolkit>/browser run vendor -- --into vendor/cardvision-browser --no-ort-wasm
npm --prefix <toolkit>/browser run vendor-check -- vendor/cardvision-browser
```

Run them from this repository's top folder. The toolkit's build copies OpenCV.js only when its
`browser/vendor/opencv/` holds the files its `opencv.lock.json` records, which
`scripts/build-opencv.mjs` makes and git does not keep. The first two commands put the copies
already in `vendor/cardvision-browser/` there, which works while the lock is unchanged; the
vendor step checks them against the lock. When the lock changes, build OpenCV.js with the
toolkit's `scripts/build-opencv.mjs` instead. `vendor-check` in the toolkit
checkout also compares the folder with that commit's build. `npm run vendor-check` here (and in CI)
runs the stand-alone checker the folder carries, which checks everything but that comparison.

ONNX Runtime Web's WebAssembly files are not vendored (`--no-ort-wasm`): the build copies them from
this repository's `onnxruntime-web` dependency, which must be the version the manifest's `ort`
entry names.

## Manual check on a local video

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

## Maintainer notes

- **The card-art CDN** (`cdn.kenbunshoku.com`: card images and the settings file) is published
  from `cdn/` with `cdn/opcdn.py` (plan, publish, verify; credentials from `cdn/.env`, never
  committed). [cdn/README.md](../cdn/README.md) has the setup and the steps;
  [cdn/SETTINGS.md](../cdn/SETTINGS.md) is the settings file's contract, and `cdn/config.json` is
  both the published settings and the extension's built-in default.

- `kenbunshoku.config.json` holds the extension's names, sites, image hosts, settings address,
  printed-number rule, geometric pin and links; `scripts/fork-config.mjs` explains and checks it.
- A new image host needs an extension release: the settings file can only name hosts in the
  config's `imageHosts`, which become the manifest's host permissions and the extension pages'
  `connect-src`.
- The settings file's `update.url` must lie under the config's `updateUrlPrefix`.
- New sets reach installs through the settings file's release pointer; the routine is in
  [MAINTAINING.md](../MAINTAINING.md). The extension's side is the toolkit's
  `remote-release.js` (vendored, with the geometric stage's rules), and `cdn/opcdn.py
  publish-release` the publishing side.
- TODO (each new set): when a store release bundles a new set, update the set line in the "New
  sets" bullet of the Limits list in [accuracy.md](accuracy.md) (today OP-17, EB-04, ST-36, PRB-02).
- TODO (unpublished addresses): the cardvision toolkit's repository, its adapt guide and the
  runtime's source are not public yet. When they are, link them from "Built on cardvision" in the README, the
  steps in [make-it-yours.md](make-it-yours.md), "The runtime" above and `NOTICE` (the cardvision-browser upstream). The
  models' `release-legal/` already points at the README's "Built on cardvision", so it needs no change.
