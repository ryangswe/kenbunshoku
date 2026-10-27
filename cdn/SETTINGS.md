# Settings file contract (`config.json`), schema version 1

The Kenbunshoku extension reads one small JSON file from the project's CDN domain to decide where
card images come from, and which card-recognition release installs run (see "The release pointer").
Changing this file, not shipping an extension release, is how images are switched to the community
server, turned off, or moved between the hosts the extension already has permission for, and how new
cards reach installed copies. A new image host needs an extension release (see "Image hosts").

This document states what the extension enforces (`src/settings/`, `src/images/chain.ts`); a
file that `opcdn.py` accepts can still have parts the extension drops.

- **URL:** `https://cdn.kenbunshoku.com/config.json`.
- **Served with:** `Content-Type: application/json`, `Cache-Control: public, max-age=300`,
  `Access-Control-Allow-Origin: *`.
- **Written by:** `opcdn.py publish --config <file>`, last, after any images it references.

## Shape

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-10-16T00:00:00Z",
  "namesOnly": false,
  "primary": { "id": "cdn", "template": "https://cdn.kenbunshoku.com/art/{art}" },
  "fallbacks": [
    { "id": "optcgapi", "template": "https://optcgapi.com/media/static/Card_Images/{sourceFile}" }
  ],
  "cardLink": "https://en.onepiece-cardgame.com/cardlist/?freewords={printedId}"
}
```

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | integer, exactly `1` | Any other value: treat the file as unusable (see "Failure rules"). Later fields are added without bumping it; a bump means a breaking change. |
| `updatedAt` | ISO-8601 UTC string | **Required** (a string; any other type makes the file unusable). Otherwise informational. |
| `namesOnly` | boolean | **Kill switch.** `true`: show no image from any source, only the card's name. Wins over every other field. |
| `primary` | source object or `null` | Our own CDN. **Required** (`null` is a value). `null` skips it (e.g. after a complaint), leaving the fallbacks. A primary whose template uses `{sourceFile}` is dropped (our CDN is keyed by `{art}`). |
| `fallbacks` | array of source objects | Tried in order after `primary` fails or is `null`. May be empty. |
| `cardLink` | any | **Obsolete: ignored by 0.1.0 and later**, whatever it holds, and no longer required (the tooltip is the card's picture alone and has no link). Earlier development builds required it (a template string or `null`), so the published file keeps it for now. |
| `geometric` | boolean, optional | The extension's extra-accuracy stage (the runtime's geometric stage, WebGPU only, with a card-feature index of about 60 MB on this CDN). Absent or `null`: on. `false`: off, without a release; the index is not downloaded, from the next page a video is hovered on. Any other value is ignored (on), and the rest of the file is still used. |
| `release` | object, optional | The card-recognition release installs run instead of their bundled one; see "The release pointer". Absent, `null` or malformed: the bundled release (a malformed one never makes the file unusable). It does not bump `schemaVersion`; an older extension ignores it. |
| `update` | object, optional | For installs that never update by themselves (an unpacked folder from a release zip). `{ "latest": "x.y.z", "url": "https://…" }`: when the running extension's version is lower than `latest`, the popup shows one dismissible "New version available" line linking to `url`. Dismissed per version; a later `latest` shows it again. `latest` must be three dot-separated integers, and `url` must be the project's releases page or an address below it (`https://github.com/ryangswe/kenbunshoku/releases`, `…/releases/…`). Absent, `null` or malformed: the field is ignored and the rest of the file is still used. It does not bump `schemaVersion`. |

A **source object** is `{ "id": string, "template": string }`, `id` not empty. An object of
another shape, in `primary` or `fallbacks`, makes the whole file unusable. `id` names the source
in logs and the dev UI, and selects the bundled file-name map for `{sourceFile}` (below). The
extension does not otherwise branch on it.

## Templates

A template is an absolute `https://` URL with placeholders, substituted per card. A template
with a placeholder not in this table (or unbalanced braces) is unusable: its source is dropped,
the rest kept.

| Placeholder | Value | Encoding |
|---|---|---|
| `{art}` | the catalog entry's `art` path, e.g. `OP01-001.png` or `jp/P-001_p1.png` | each `/`-separated segment percent-encoded, slashes kept |
| `{file}` | the last segment of `{art}` | percent-encoded |
| `{cardId}` | the catalog card id | percent-encoded |
| `{printedId}` | the number printed on the card, or none (below) | percent-encoded |
| `{sourceFile}` | this source's own file name for the card, from a map bundled in the extension keyed by the source's `id` (`{ "<source id>": { "<cardId>": "<file name>" } }`, text only) | percent-encoded |

**`{printedId}`.** From the card id: drop a trailing `-JP`, then a trailing variant suffix
`-r<n>` or `-pr<n>`; split on `_`; take the first part shaped like a card number,
`^[A-Z]{1,4}\d{0,2}-\d{2,3}[A-Z]?$`. If no part matches, the card has no printed number: the
`{printedId}` is unavailable for it. DON!! cards (`don_8`) have none.

| Card id | `{printedId}` |
|---|---|
| `OP01-060`, `OP10-045_p2`, `EB01-003__promo1` | `OP01-060`, `OP10-045`, `EB01-003` |
| `EB01-006_p4-JP`, `P-011-JP` | `EB01-006`, `P-011` |
| `OP09-078-r1`, `P-089-pr6` | `OP09-078`, `P-089` |
| `EB03_OP05-006_p1` | `OP05-006` (the set prefix is not a number) |
| `don_8` | none |

**Unavailable placeholder → skip the source.** A card whose `art` is `null` cannot use a
template with `{art}` or `{file}`; a card absent from the source's map (or a source id with no
map) cannot use `{sourceFile}`; a card with no printed number cannot use `{printedId}`. The
extension skips that source for that card and tries the next, else shows names. `{cardId}` is
always available.

The `{sourceFile}` map ships inside the extension, not on the CDN, so the fallback keeps working
when the CDN is down. Adding a source that needs a map therefore needs an extension release;
sources using only `{cardId}`/`{printedId}` on a host the extension already has do not.

## Image hosts

The extension requests images only from hosts in its manifest's host permissions, today
`cdn.kenbunshoku.com` and `optcgapi.com`; its pages' Content-Security-Policy (`connect-src`)
allows only those, so a redirect to another host fails too. A `primary` or fallback whose
template names any other host is dropped (the rest kept). **A new image host needs an extension
release** that adds the host permission.

**`cardLink` value (obsolete, ignored by 0.1.0 and later):**
`https://en.onepiece-cardgame.com/cardlist/?freewords={printedId}`, kept in the published file
for earlier development builds, which required the field.

## Resolution per hover

1. `namesOnly` is `true` → the card's name. Stop.
2. For `primary` (if not `null`), then each `fallbacks` entry in order: build the URL; skip it
   if a placeholder it needs is unavailable; load the image; on success show it and stop. A
   load failure (network error, non-2xx, decode error, or 5 s timeout) moves to the next.
3. Nothing loaded → the card's name.

A source that failed may be skipped for the rest of the session after 3 consecutive failures;
re-try it after a fresh `config.json` read.

## Failure rules

- **Fetch:** at extension install and browser start-up, then at most once an hour while running:
  when a tooltip frame opens, when a card is newly shown, and when the popup opens, if the last
  attempt is an hour old. The attempt is recorded even when it fails. The request carries no
  cookies and no referrer and is given up on after 10 s. Keep the last good copy in extension
  storage; it is validated again on every read.
- **Unreachable, non-2xx, malformed JSON, `schemaVersion` ≠ 1, or a required field missing or of
  the wrong type:** keep using the last good copy; with none, use the built-in default (a copy of
  the shipped `config.json` bundled in the extension).
- **Unknown extra fields:** ignore them.
- **Dropped, the rest kept:** a source whose template is not an absolute `https://` URL, has an
  unknown placeholder, or names a host the extension may not request (see "Image hosts"); a
  `primary` that uses `{sourceFile}`. A malformed `update` is ignored, and `cardLink` always is
  (obsolete). A malformed `release` is ignored (the bundled release is used).
- **Image requests** carry no cookies and no referrer. An image counts as loaded only once the
  browser has decoded its bytes; its type is never taken from the file name.

## The release pointer (`release`)

New cards reach installed copies without a store update: the settings file may name a
card-recognition release published on this host, and a qualifying install loads it instead of the
release bundled in the extension. The release is data only (JSON and ONNX files); code stays in the
package. Anything wrong with it, at any step, loads the bundled release. The extension's side is
`src/release/` and `src/compute/frame.ts`; the publishing side is `opcdn.py publish-release`.

```json
"release": {
  "id": "0123456789abcdef",
  "path": "vision/releases/0123456789abcdef/release.json",
  "sha256": "<64 hex: SHA-256 of release.json's bytes as served>",
  "minimumExtensionVersion": "0.2.0",
  "geometric": {
    "path": "vision/releases/0123456789abcdef/geometric.json",
    "sha256": "<64 hex: SHA-256 of geometric.json's bytes>",
    "manifestSha256": "<64 hex: SHA-256 of the packed index's manifest>"
  }
}
```

| Field | Rule | Meaning |
|---|---|---|
| `release` | object, optional; absent or `null`: no pointer | The release every qualifying install runs instead of its bundled one. |
| `id` | `^[0-9a-f]{16}$` | The release id (the hash of its canonical document; the runtime checks it). |
| `path` | **exactly** `vision/releases/<id>/release.json` (string equality) | Resolved against this file's address, so always this host. No scheme, `..`, `%2e` or query. |
| `sha256` | `^[0-9a-f]{64}$` | SHA-256 of the document's bytes, checked before the worker starts. |
| `minimumExtensionVersion` | `x.y.z`, **required** | A running version below it ignores the whole field. The first pointer-aware Kenbunshoku is 0.2.0. |
| `maximumExtensionVersion` | `x.y.z`, optional, **exclusive** | A running version at or above it ignores the whole field. Left out unless a downgrade window needs it. |
| `geometric` | object, optional | The geometric stage for this release (see "The geometric stage under a release"): `path` exactly `vision/releases/<id>/geometric.json`, `sha256` of that file, `manifestSha256` of its index's manifest. Absent or malformed: the release runs with the stage off. |
| unknown keys inside `release` | ignored | Forward compatibility. |

A store build bundles the release the pointer names when it is built, so a fresh install loads
nothing (rule 4).

### Rules the extension enforces

The compute frame reads the settings in effect once per page, at its start (the first hover on a
page with card hovers on; nothing happens at install). **A page tries the remote release at most
once; every fallback goes to the bundled release and never back.**

| # | Condition | Outcome | Log reason |
|---|---|---|---|
| 1 | `release` absent or `null` | bundled (the request is byte-for-byte what it was before pointers) | `absent` |
| 2 | malformed (the rules above; `id` not the id in `path`) | field ignored, rest of the file kept: bundled | `malformed:<key>` |
| 3 | running version below the minimum, or at or above the maximum | bundled | `version` |
| 4 | `id` is the bundled release's id | bundled, **nothing downloaded** | `same-as-bundled` |
| 5 | the skip-list holds `(id, sha256)`, less than 24 h old | bundled | `skipped:<reason>` |
| 6 | the document: network error, non-2xx, or 10 s for all of it | bundled | `unreachable` / `http-<n>` |
| 7 | SHA-256 of the document is not `sha256` (after one re-fetch past the cache) | bundled; skip-listed | `doc-sha` |
| 8 | the document is not JSON, its `id` is not `id`, or a pinned path is not a flat name `^[A-Za-z0-9][A-Za-z0-9._-]*$` | bundled; skip-listed | `doc-shape` |
| 9 | a file download fails, is non-2xx, or stalls (30 s with no bytes; no cap on the total) | bundled | `unreachable:<file>` |
| 9b | a downloaded file's size or SHA-256 is not the document's (after one re-fetch past the cache) | bundled; skip-listed | `file-sha:<file>` |
| 10 | the worker refuses the release (`release-status.ok` false) | a new worker, bundled; skip-listed only as below | `runtime:<reason>` |
| 11 | the worker loaded another id than the pointer's | that worker ended, a new one, bundled; skip-listed | `id-mismatch` |
| 12 | the worker fails after loading a remote release | its one restart loads the bundled release (stage off, as for any restart) | `worker-restart` |

**Skip-list.** `chrome.storage.local["releaseSkip"]` holds one entry `{id, sha256, reason, at}`, or
none. It is recorded for rules 7, 8, 9b and 11, and for rule 10 only when the refusal came before the
worker said it was preparing the models (the files and their bindings were judged then); never
for network failures (6, 9), refusals after that point, the runtime's catch-all (`unexpected:`), the
frame's own errors (a worker that did not start) or worker crashes. Before a document or file
SHA-256 failure is recorded, that URL is fetched once more with `cache: "reload"`. A new entry
replaces the old one. The entry is cleared when the pointer names another `(id, sha256)` (so a
later move back to it is tried again), when `release` is absent, and when it is 24 h old.

**File reuse.** Each of the five files the remote document pins that has the same SHA-256 and size
as a file of the bundled release is taken from the extension, under the remote document's name;
every other file is downloaded from `vision/releases/<id>/<path>`. The runtime checks every file,
reused or downloaded, against the remote document. A card-only update reuses both models and
downloads the bank, the identity groups and the catalog.

**Downloads** are made by the compute frame with `credentials: "omit"`, `referrerPolicy:
"no-referrer"` and `cache: "default"` (the release's files are immutable, so a later page reads them
from the browser's cache), read as streams; while they run, the page shows its usual loading state.

### The geometric stage under a release

The stage's settings file (`geometric.json`) pins the card-feature index the stage reads, so a
release with new cards needs its own. The pointer's `geometric` names it; the compute frame checks it
before the worker sees it, and logs one more line, `[Kenbunshoku] geometric source=remote|off
reason=<code> pointer=<id>`.

| # | Condition | Outcome | Log reason |
|---|---|---|---|
| G1 | the settings say `geometric: false`, or the build has no stage | remote release, stage off | `geo-setting` |
| G1 | `geometric` absent, or malformed | remote release, stage off | `geo-absent` / `geo-malformed:<key>` |
| G2 | `geometric.json` unreachable or non-2xx (10 s), its SHA-256 not `geometric.sha256`, not JSON, or its `index.path` not a manifest on this host at `/vision/geo/<16 hex>/manifest.json` (a flat folder) or `/vision/geo/<16 hex>/manifest-<16 hex>.json` (a series folder), with no query | remote release, stage off | `geo-unreachable` / `geo-sha` / `geo-shape` |
| G3 | the runtime refuses the index (manifest SHA-256, bank binding, a bank card without a row, a shard's hash) | remote release, stage off for the page; never a failed release | `geo-runtime:<the runtime's reason>` |

The runtime keeps the index's shards in the browser's cache and, after each load, deletes what lies
outside the loaded manifest's folder. So a page that **falls back** from a remote release (rules
6–11) loads the bundled release with the stage **off**, unless the pointer's `manifestSha256` is the
bundled index's: loading the bundled index would otherwise delete the remote one, and the next page
would download it again (about 45 MB). A page whose pointer is decided before anything is fetched
(rules 1–5) loads the bundled release with its stage as usual.

**Index folders.** A flat folder (`manifest.json`, `opcdn.py publish-geo`) is written once and never
added to. A series folder grows: each version's manifest is `manifest-<16 hex>.json` and its shards
keep their names, so a set adds a few MB instead of a new 60 MB index. A series never starts in a
folder that holds a flat index, nor a flat index in a series folder (the cache would keep the other
kind's shards; `opcdn.py` refuses both), and a new folder starts on a
change of features or OpenCV, or of an existing card's art. Moving between folders (flat to series,
or back on a rollback) deletes the old folder's cached shards on the first load of the new one.

**Workers.** The fallback of rules 10 and 11 is a planned replacement, not a restart: the bundled
worker then has the usual budget (a failure to load turns recognition off for the page; a crash
after loading, one restart).

**Card facts.** The tooltip's table of names (`data/cards.json`) is built from the bundled catalog,
so a card new in a remote release would be recognized and then shown as nothing. The compute frame
therefore builds the same table (`src/shared/card-table.mjs`, the build's own rule) from the catalog
it hands the worker, before the load, and adopts it only when the worker confirms that release's
id. With each card it shows from that release, it posts the card's facts (`{releaseId, cardId,
facts: {name, set, art}}`) on `BroadcastChannel("kenbunshoku-card-facts")`, then sends the card, with
the release id, through the page as before. The channel reaches the extension's own pages (other
tabs' frames too) and no web page. A tooltip frame that has a card of a remote release to show and
not its facts (made again, or the card came first) asks on the channel (`{want: true, releaseId,
cardId}`); the compute frame of that release answers for a card it has shown (the last 256) and
for nothing else, and facts that arrive for the card on show replace what it showed. A file is read
no further than its pinned size, and the document no further than 256 KB. The tooltip looks a card up in the
facts it received for that release first, then in its bundled table; an id in neither is waited for
300 ms, then shows nothing. The page can post card messages to the tooltip frame, but it cannot reach
the channel, so it can never make the tooltip show a name or picture that a compute frame did not
send. The facts are checked on arrival (strings of at most 200 characters, a clean relative art
path); every later lookup for the card on show uses them. Pictures are cached by card id and art
path, so a release that gives a card other art shows the other art. The `{sourceFile}` fallback map
is bundled and has no entry for a new card, so that fallback is skipped for it; the primary CDN (art
is published before the pointer moves) serves it.

**Logging** (local, never sent): one `console.info` line per decision in the compute frame,
`[Kenbunshoku] release source=remote|bundled reason=<code> pointer=<id|-> bundled=<id> reused=<k>/5
downloaded=<bytes> ms=<n>`, where `downloaded` counts decoded bytes. Never the page's address, the
channel, the video, frames or cards. Dev builds add `release` and `geometricReason` to `__kenbunshokuDebug`.

**Once per frame.** "Once per page" is once per compute frame: if the page removes the frame, a new
one decides again.

**Pickup.** A running browser picks a pointer move up within about 1 h 5 min (the hourly settings
fetch plus this file's 5-minute cache), or at its next start. Rolling back is pointing back to an
earlier release, or removing the field.

### The release folder on the CDN

| Key | Content-Type | Cache-Control |
|---|---|---|
| `vision/releases/<id>/release.json` (written last within the folder) | `application/json` | `public, max-age=31536000, immutable` |
| `vision/releases/<id>/{detector,recognizer}.onnx` | `application/octet-stream` | immutable, as above |
| `vision/releases/<id>/{bank,identity-groups,catalog}.json` (the document's own names) | `application/json` | immutable |
| `vision/releases/<id>/LICENSE`, `NOTICE` / `PROVENANCE.md` | `text/plain; charset=utf-8` / `text/markdown; charset=utf-8` | immutable |
| `vision/releases/<id>/geometric.json` (pinned by the pointer; before `release.json`) | `application/json` | immutable |
| `vision/geo/<16 hex>/…` (the index, `publish-geo`; see "Images on our CDN") | as there | immutable |
| `vision/releases/index.json` (the tool's record; not part of this contract) | `application/json` | `no-cache` |

The full pinned set is uploaded even when the extension would reuse some of it. Every object
carries `Metadata: {sha256}`. Folders are never overwritten or deleted. JSON should be served
compressed (the bank and catalog are most of a card-only update).

### Publishing a release

`opcdn.py publish-release --release <folder named after its id> --min-version 0.2.0
[--geometric F --geo-manifest-sha256 SHA] [--config cdn/config.json --set-pointer] [--sessions] [--dry-run]`:

1. **Seal:** the document parses, its id is the folder's name, every pinned file is a flat name
   present with its size and SHA-256, and `release-legal/` names this release (`NOTICE`'s first
   line, as for a build); then `scripts/verify-remote-release.mjs`, the vendored runtime's own
   checks (`--sessions` also starts both ONNX Runtime sessions in Node: use it whenever a model
   changed).
2. **Runtimes:** every extension version in `cdn/RUNTIMES.json` that the pointer would reach must
   run the release's ONNX Runtime major.minor; otherwise raise `--min-version`. A release that needs
   a newer runtime ships bundled in a store release first, and the pointer moves at least 14 days
   later.
3. **Geometric** (with `--geometric`): the file passes rule G2 with an absolute
   `https://cdn.kenbunshoku.com/vision/geo/…` `index.path` (the tool is stricter than the extension), its index manifest is already on the
   CDN (`publish-geo` first) with the SHA-256 `--geo-manifest-sha256`, bound to the release's bank,
   with a row for every bank card. Without `--geometric` the pointer has none, and installs run the
   release with the stage off.
4. **Remote state, through the S3 API only** (never the public URL, so no 404 is cached at the
   edge): missing files are uploaded, identical ones skipped, and another file's bytes under one of
   the keys refuse the whole run before anything is written.
5. **Upload** the files, then `geometric.json`, then `release.json`; each is checked with HEAD.
6. **Verify live** (`verify-release-live`): the document over https, the runtime's checks on the
   served files, each file's SHA-256, type, cache rule, no NEL, CORS for each real extension id
   (`OPCDN_EXTENSION_IDS`) and compression; with a geometric pointer, `geometric.json` and its
   index's manifest and bank binding.
7. **Pointer:** the `release` block is computed from what was verified (`--set-pointer` writes it
   into the config file), and `config.json` is uploaded last.

`opcdn.py publish --config F` refuses a `release` that does not verify live, so a pointer only ever
moves to a verified folder, a rollback included. `opcdn.py verify-release-live` checks the live
pointer at any time. Art for new cards (`opcdn.py publish --catalog …`) and the index
(`publish-geo`) go out before the release, so the pointer is the last thing that moves.

### What the pins do not guard against

The SHA-256 pins guard against corruption, stale caches and partial uploads. They do not guard
against someone who controls the CDN bucket or zone, who could publish a self-consistent folder and
pointer. Such a person can only choose among folders on this host (the path rule and the extension's
content security policy fix the host) and change data, never code: scripts and WebAssembly are in
the package. Card names are shown as text. Keep the CDN tokens narrowly scoped (one bucket, object
read and write) and on the maintainer's machine.

## Images on our CDN

- Key: `art/<art path>`, exactly the catalog's `art` value (original bytes, as mirrored). The
  `Content-Type` comes from the bytes, not the name: some `.jpg` files hold PNG or WebP bytes.
  Uploads are additive; a card's file is never deleted by the tool.
- `Cache-Control: public, max-age=86400`. A replaced image (e.g. a new scan) reaches viewers
  within a day; purge the URL in the Cloudflare dashboard to make it immediate.
- `art/index.json` lists every uploaded path with its sha256 and size. It is the tool's record,
  not part of this contract; the extension does not need it.
