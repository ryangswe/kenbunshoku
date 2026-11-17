<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing a new version

A new version reaches the Chrome Web Store, addons.mozilla.org and the GitHub release page through
one pull request. Merging it does the rest, except for four steps that need the maintainer: the
merge, the Firefox privacy text when it changed, the approval of the upload, and publishing the
settings file.

## The release pull request

One pull request holds everything a version needs. Its "Store packages and check" must be green
before it is merged: once it merges, the tag and the GitHub release are made and cannot be undone.

- `package.json` and `package-lock.json` at the new version.
- In `CHANGELOG.md`, the Unreleased entries moved under a heading for the version with the date
  it is merged, in UTC (`## 1.2.0 (2026-11-20)`), and a line under it that links its GitHub
  release, `[GitHub release](https://github.com/ryangswe/kenbunshoku/releases/tag/v1.2.0)`. This
  section becomes the GitHub release's notes. Correct the date before merging if the merge
  happens on another day.
- `store/releases/<version>.json`, with its Firefox release notes and notes to reviewers.
  addons.mozilla.org accepts at most 3000 characters of notes to reviewers, and the store check
  refuses more.
- A row for the version in `cdn/RUNTIMES.json` (the vendored toolkit commit, ONNX Runtime Web and
  the bundled card release). `store/record-facts.json` names the bundled card release too, and
  moves with it.
- The update notice in `cdn/config.json`: `update.latest` at the new version and `update.url` at
  its GitHub release, `https://github.com/ryangswe/kenbunshoku/releases/tag/v<version>`.
- If the version changes what PRIVACY.md must say, PRIVACY.md changes on `main` in an earlier pull
  request, usually the one that changes the behavior. The release file's `before` list pins
  PRIVACY.md on `main` by its SHA-256, so the release pull request's check passes only once that
  text is live. The check does not run again by itself when the policy lands, so re-run it then:
  on the release pull request's Checks tab, open "Store packages and check (no store access)"
  and choose "Re-run jobs". The release pull request says in its description that the policy
  changed, because addons.mozilla.org keeps its own copy (step 2 below).

## The maintainer's steps

1. **Merge the release pull request.** The "Extension release" workflow then creates the tag
   `v<version>` and the GitHub release, and starts the "Store release" workflow on that tag. Do not
   push the tag yourself.
2. **Paste the privacy policy on addons.mozilla.org, only if it changed.** The release pull
   request says when it did. Paste the new policy into the privacy policy field of Kenbunshoku's
   page there. Do it before step 3, because the upload does not
   change that field. Chrome's listing links PRIVACY.md on GitHub, so it needs nothing.
3. **Approve the upload.** In Actions, open the "Store release" run for `v<version>`, choose
   "Review deployments", tick `store` and approve. The run checks both stores first and uploads
   nothing if either one is not ready. Then it uploads to both and submits them for review. The
   packages, the zip for people who load the extension unpacked, `SHA256SUMS` and the release
   record are attached to the GitHub release by themselves, a few minutes after the merge.
4. **Publish the settings file**, from your checkout on `main`:

   ```bash
   npm run publish:settings
   ```

   It brings the checkout up to date and stops while the GitHub release has no zip yet. Then it
   shows which fields change, runs a dry run, asks before publishing, and checks what the CDN
   serves. Zip installs then show the notice that the new version is out. Add `-- --check`
   to see what it would do without publishing (it still brings `main` up to date).

The stores review the version in hours to days. Nothing more is needed when they publish. The
"Store status" workflow compares both stores with the newest release file every day and fails,
which emails the maintainer, when a store shows a version it should not.

## When something goes wrong

- **The merge released nothing.** The "Extension release" run's summary names what is missing:
  the release file, a dated changelog section, or a version that already has a tag. Fix it in a
  pull request; the next merge to `main` releases the version.
- **One store failed after the other succeeded.** Re-run the failed job of the "Store release"
  run. The store that already has the version is skipped.
- **The store check refused the release.** Its run page says why (notes too long, a permission
  change the release file does not declare, a new Firefox lint warning, an address in `before`
  that is not live). Fix it in a pull request before merging. When the fix is somewhere else,
  such as a PRIVACY.md change on `main`, re-run the release pull request's check once it is
  live.
- **The settings publish stopped.** It says why and changes nothing on the CDN before the dry run
  passes and you answer yes. Run it again once the cause is fixed.

Release tags cannot be deleted or moved. A version that went out wrong is fixed by the next
version.

## What stays manual, and why

- The approval stays because the `store` environment's required reviewer is the only way the
  store credentials are handed to a run.
- The Firefox privacy text stays because the workflows upload packages and notes, and never
  change a store listing.
- The settings file stays because the CDN credentials stay on the maintainer's machine, and no
  workflow names them. See `cdn/README.md` for the CDN tool itself.

The workflows are the cardvision toolkit's templates (`.github/workflows/extension-release.yml`,
`store-release.yml` and `store-status.yml`). The toolkit's `docs/store-uploads.md` describes them
in full.
