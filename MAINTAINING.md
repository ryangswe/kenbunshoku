<!-- SPDX-License-Identifier: Apache-2.0 -->
# Maintaining Kenbunshoku

Light upkeep: new sets, and a refresh when the cardvision models improve. Everything Kenbunshoku
depends on sits in accounts of its own, so a new maintainer can take it over.

## New sets

New sets reach installed copies (0.2.0 and later) through the settings file's release pointer
([cdn/SETTINGS.md](cdn/SETTINGS.md), "The release pointer"), with no store update. A set is added
once it is on Bandai's official English card list, and only from that list: its images byte for
byte (the SAMPLE overprint included), its English names, and nothing else. A printing the official
English list does not show is not added, and cards revealed before the list are not added at all.

1. **Official images.** Save the set's printings from the official English card list into the card
   mirror, on the maintainer's machine. Images never go into this repository or any other.
2. **Catalog.** Append the new printings to the live release's catalog: official ids, the official
   English name for a new card, the catalog's own name for a new printing of a card it has. Existing
   entries stay byte-identical; an entry whose art already matches a listed printing is not added
   twice.
3. **Bank rows for the new cards.** With the live release's recognizer, embed the new art and append
   rows to the bank (`cardvision build-bank --base`, then `cardvision check-refresh`: every existing
   row byte-identical, identity groups only grown, and `cardvision check-bank-art`), then
   `cardvision build-release` into a folder named after the new release id. Look at a handful of the
   new cards' images before going on.
4. **The geometric index.** Build the card-feature index from the new bank (`cardvision
   build-features --pin`, then `cardvision pack-features`) and write the release's geometric settings
   file, whose `index.path` names that index on `cdn.kenbunshoku.com`. Today's index is a flat folder
   written once (`manifest.json`); an index that grows by appending (a series folder,
   `manifest-<16 hex>.json`) starts in a folder of its own, never in a flat one.
5. **The regression check.** Run the maintainer's pre-registered replay against the live release:
   on the real development frames none of the cards named right may be lost (generated scenes
   allow a small fixed number of changes), and the new cards must be recognized about as well as
   cards the models never trained on. A release that fails is not
   published. Its rules are fixed in advance and are not changed after seeing a result.
6. **Legal files.** Update `release-legal/` for the new release id (the opening line of `NOTICE`
   names it; `PROVENANCE.md` says what was added). They are published beside the release's files.
7. **Publish**, art first and the pointer last:
   - the new art: `cdn/opcdn.py publish --catalog <release folder>/catalog.json --images <card mirror>`;
   - its WebP copies, when `config.json`'s primary names a generation (`art/webp<N>/`): `cdn/opcdn.py
     publish-webp` with the same catalog and images and that `--generation`;
   - the index: `cdn/opcdn.py publish-geo --dir <packed folder> --expect-sha256 <manifest sha256>`;
   - the release: `cdn/opcdn.py publish-release --release <folder> --min-version 0.2.0 --geometric
     <geometric settings file> --geo-manifest-sha256 <manifest sha256> --config cdn/config.json
     --set-pointer`, tried with `--dry-run` first. It uploads the release folder, verifies it live, and
     moves the pointer in `config.json` last. Commit the changed `cdn/config.json`.

   Publishing needs the CDN account's token: it is the owner's step, or the maintainer's under a
   standing permission the owner gave for updates that add cards and nothing else, which applies
   once the owner has published the opening two pointer moves.
8. **Confirm** after about an hour (`cdn/opcdn.py verify-release-live`; a hover on a new card).
   Rolling back is publishing the previous `release` block, or removing it.
9. **Pictures in other languages** (optional; the set's cards show English pictures without it):
   when the set is on Bandai's card list in that language, add its pictures with
   `cdn/opcdn.py publish-l10n` and publish the new `localizedArt` entry ([cdn/README.md](cdn/README.md),
   "Card pictures in other languages").

Then update the set line in the "New sets" bullet of [docs/accuracy.md](docs/accuracy.md) when a
store release bundles the set. The next store release bundles the release the pointer names then,
so fresh installs download nothing. Installs older than 0.2.0, and zip installs that never update,
keep the cards of their bundled release until they are updated. A new model (a retrain) is a
core-model refresh, below, not a set update.

## Store releases

- The package: bump `version` in `package.json`, then `npm test`, `npm run build -- --release <release
  folder> --store` and `npm run package`. The store zip (`kenbunshoku-<version>-store.zip`) has
  `manifest.json` at its top level and no `key`; the other zip (`npm run build -- --release <release folder>`) is for the release page. The
  opening line of `release-legal/NOTICE` must name the release (the build refuses otherwise).
- A store build bundles the release the pointer names when it is built, and its geometric pin
  (`geometric.manifestSha256` in `kenbunshoku.config.json`, and `data/geometric.json`) is that
  release's index.
- Add a row to `cdn/RUNTIMES.json` for the new version (its runtime commit, ONNX Runtime Web version
  and bundled release), so that `publish-release` knows which versions a pointer reaches.
- The store version moves in step with the GitHub release: the same version, built from the same
  commit. Submitting, and every declaration in the store's dashboard, is the owner's.

## A core-model refresh

When the cardvision toolkit publishes a better detector or recognizer, or a new runtime:

1. Build a release folder from the new models (`cardvision build-release`) and verify it. Measure
   it on a fresh held-out set before shipping; a release that was not measured says so in
   [docs/accuracy.md](docs/accuracy.md). A new recognizer means a new bank, so a new geometric
   index too.
2. If the runtime changed, vendor the new commit: `node scripts/vendor-runtime.mjs --repo <toolkit
   checkout> --commit <sha> --opencv <OpenCV.js build>` (see [docs/development.md](docs/development.md)).
   Keep `onnxruntime-web` in `package.json` at the version `vendor/cardvision-browser/VENDOR.json`
   names. Run `npm test`.
3. Update `release-legal/` (license, notice, provenance of the models). A release with new models
   can be published through the pointer like a set update (`publish-release --sessions`, after its
   held-out measurement), or bundled in a store release: one that needs a newer runtime ships
   bundled in a store release, and the pointer moves at least 14 days later, with `--min-version`
   raised to that version.

## Accounts to transfer in a handoff

Each is separate from every other project's, so it can change hands whole:

- **Domain** (`kenbunshoku.com`; the CDN host `cdn.kenbunshoku.com`).
- **Cloudflare account** (R2 bucket, custom domain, CORS policy, the geometric index's cache rule;
  the settings file `config.json` lives there, so whoever owns it controls where images come from
  and which release installs run).
- **GitHub repository** (this code, issues, releases; `updateUrlPrefix` and `projectUrl` in
  `kenbunshoku.config.json` point at it).
- **Hugging Face repositories** (the models and labels).
- **Chrome Web Store listing** (in the publisher's account; a transfer may mean a new listing).
  Its images are in [docs/store/](docs/store/README.md).
  The settings file's `update` field can point installed copies to a new listing or release page.

Changing hands also means a new extension key pair for unpacked installs (the old private key goes
with the old owner), `projectUrl` and `maintainerContactUrl` in the config, and the contact in the
store listing.

## Safe by default

If a complaint arrives, the settings file can turn pictures off at once (`namesOnly: true`), drop
the CDN source (`primary: null`), turn the geometric stage off (`geometric: false`) or point every
install back to its bundled release (remove `release`) without an extension release; installed
copies follow within about an hour. See [cdn/SETTINGS.md](cdn/SETTINGS.md).
