<!-- SPDX-License-Identifier: Apache-2.0 -->
# Privacy

Kenbunshoku is a browser extension that names One Piece Card Game cards in YouTube and Twitch
videos. This page says what it reads, what it sends, and what it keeps.

## In short

- No accounts, no analytics, no telemetry, no advertising.
- Video frames are processed temporarily in memory, inside your browser. They are not saved to
  storage and never uploaded.
- The extension makes requests to two hosts, `cdn.kenbunshoku.com` and `optcgapi.com`, for a
  settings file, card pictures, updated card-recognition data when new cards are published, and,
  where the browser has WebGPU, a card-feature file of about 60 MB, downloaded once and cached. It is
  downloaded the first time you point at a video on YouTube or Twitch with card hovers on, not when
  a video merely plays. The video may have no cards in it.

## What it reads

- **On supported `www.youtube.com` and `www.twitch.tv` pages**, including `www.youtube.com`
  player frames embedded in other websites: it reads what card hovers need. That is where the
  pointer is over the page's main video and, while card hovers are switched on in the popup, the
  picture of the video. Nothing is read from a video before the pointer comes over it. It reads
  the picture only around your pointer activity over the video: for 10 seconds after the pointer last moved there, and after that
  only while a card is showing under the resting pointer (until 5 seconds after it stops
  showing), and never more than 60 seconds after the pointer last moved. It stops when the pointer
  leaves the video or the tab goes to the background.
- It does not access the browser's saved browsing history, and does not read comments, chat messages
  or account information. It does not read the website around an embedded player. The picture it analyzes is the whole
  video frame, so anything drawn into the video itself (such as an overlay showing chat) is part
  of that picture; the extension looks only for cards in it and does not read text or identify
  people.
- Nothing on any other site.

Card hovers are on for every supported video, with no per-channel switch. Embedded
`www.youtube.com` players on any website are included, with no step to turn them on. An embedded
player playing does not start card hovers, even one that plays by itself, such as a background
video: they start when the pointer first comes over its picture. With the toolbar switch off, the
extension reads no video on any page. The settings check (below) continues.

## What happens to the picture

A picture is drawn at analysis size and handed to the extension's own frame inside the page,
where the recognition model runs (on your graphics card through WebGPU, or on your processor).
With WebGPU, each recognized card is also compared with the card-feature file (below), on your
computer.
The result is a card name, a card number and a box. The picture is held in memory only while it
is analyzed, then discarded. It is not saved to storage, uploaded or shared.

## What it sends, and to whom

Card hovers start in a tab when the page's main video plays there, with Kenbunshoku switched on
in the popup, whether or not you point at it. A video that has not played, such as one paused when
the page opened, starts them when the pointer first comes over its picture. So does a YouTube
player embedded in another website, and a video on a Twitch page other than a channel's page, a
past broadcast or a clip, such as the featured stream on Twitch's front page. A video that plays
in a tab you are not looking at also starts them, and so does a supported video with no cards in
it. Starting card hovers loads the recognition model and makes the requests below, except the
card-feature file, which waits until you point at the video. Starting card hovers reads no picture
of the video. After 10
minutes in which the pointer has not moved over the video and no card has been showing,
Kenbunshoku unloads card hovers in that tab to free memory. They start again the next time the
pointer comes over the video; the video simply playing on does not start them again. Turning card
hovers off and on in the popup starts them afresh, as when the page opens: at once where the main
video plays on a page where playing starts them, or else when it next plays or the pointer comes
over it. Each time, the
requests below follow the same rules: most files come
from your browser's caches, and the settings file is still checked at most once an hour.

| Request | To | When | What the host learns |
| --- | --- | --- | --- |
| The settings file (`config.json`) | `cdn.kenbunshoku.com` | When the extension is installed or updated and when the browser starts, then at most once an hour while you use it (when you open the popup, or when card hovers start in a tab) | Your IP address and that the extension asked for its settings |
| A card's picture | `cdn.kenbunshoku.com`, or `optcgapi.com` when the first fails | When a card is shown and its picture is not already loaded | Your IP address and which card picture was asked for; for a picture in your card language, that language (it is part of the picture's address) |
| The list of cards with a picture in your card language (about 100 KB) | `cdn.kenbunshoku.com` | Only when your card language is one the settings file offers pictures in (French today): when card hovers start in a tab, unless your browser already has it in its cache. Never with card pictures turned off | Your IP address and that the list for that language was downloaded |
| The card-feature file (a manifest and its parts, about 60 MB in all) | `cdn.kenbunshoku.com` | Once, the first time you point at a video on YouTube or Twitch with card hovers on (not when a video merely plays; the video may have no cards in it), in a browser that has WebGPU; never at install. Again only if the browser cleared its storage or the file changes: when new cards are published with a new card-feature file, or after the extension went back to the data built into it | Your IP address and that the file was downloaded |
| Updated card-recognition data (a release: its card list, card fingerprints, the settings of the card-feature check and, after a model update, the recognition models; data files, never code) | `cdn.kenbunshoku.com` | When card hovers start in a tab and the settings file names a release other than the one built into your version of the extension: a newer one, or an earlier one after a rollback (otherwise never). About 1.5 MB once per release when cards are added, about 12 MB when the models themselves are updated; afterwards it is read from your browser's cache. Your browser may keep a separate copy for each website, so watching on both YouTube and Twitch can download it twice. Nothing is downloaded at install or with card hovers off | Your IP address, the time, your browser's user agent and language, that this browser downloaded that release, and the extension's own id (sent as the request's origin) |

These requests carry no cookies, no account ID or per-user tracking identifier, and not the
address of the page you watch. Settings, picture and release requests made by the extension's pages
carry no `Referer` at all; the card-feature file, and the settings of the card-feature check that
a release names, are requested by the recognition worker and may carry the extension's own address
as `Referer`, which names nothing but the extension. Like any
web request, they show the host your IP address, which file was asked for, and the headers your
browser adds to every request. The extension sends nothing else to anyone, and it does not send
which channels or videos you watch.

`cdn.kenbunshoku.com` is run by the maintainer on Cloudflare (R2 storage). No request logging is
set up for it: the maintainer can see only Cloudflare's aggregate traffic statistics, not a
record of individual requests or IP addresses. Cloudflare handles the requests under its own
[privacy policy](https://www.cloudflare.com/privacypolicy/). `optcgapi.com` is run by a third
party; it publishes no privacy policy that we could find (checked on 2026-10-16).

The settings file can turn card pictures off (`namesOnly`); the extension then requests no
pictures at all, in any language, and no list of them. The maintainer can also point every install back to the recognition data built into
it, or to an earlier release, within about an hour, with no action from you and no store review.

### Your card language

To show card pictures in your language, the extension uses the card language you pick in the popup.
On **Automatic**, the default, it reads the languages in your browser's language settings in order
(for example Japanese, then French) and takes the first that is English or that the settings file
offers pictures in. When that language is not English, cards that have a picture in it show it,
and the others show the English picture. Your browser's languages are not stored. The card
language you pick is stored on your computer (see below). The card language reaches
`cdn.kenbunshoku.com` only as part of the addresses above. On Automatic, it is one of the languages
your browser already sends in the `Accept-Language` header of every request. A language you pick
yourself may not be one of them, and then the picture addresses tell `cdn.kenbunshoku.com` that
language too.

## What it keeps on your computer

Stored locally by the extension, not synced to your other devices, and never sent anywhere:

- **In `chrome.storage.local`** (settings):
  - whether it is switched on;
  - the card language you pick in the popup (Automatic unless you change it);
  - the card size you set in the popup (70% to 130%);
  - whether **Keep the card I'm pointing at** is on in the popup (on unless you turn it off);
  - the last settings file it fetched, and when;
  - if updated recognition data failed its checks, that release's id and why, so that it is not
    downloaded again for a day (after 24 hours it is ignored, and deleted the next time it is read);
  - the version of a "New version available" notice you dismissed.
- **In Cache Storage** (the extension's own cache): the card-feature file. The extension asks
  the browser to keep it; if the browser clears it anyway, it is downloaded again the next time
  you point at a video.

The "unlimited storage" permission lets the extension keep its approximately 60 MB card-feature
cache without the normal quota and eviction limits. It does not give the extension access to any
other website.

Card pictures are kept in memory while the tab is open, and in your browser's ordinary cache, as
are the files of updated recognition data.

It keeps no list of the channels or videos you watch. Earlier versions kept the channels you
turned card hovers on for; updating to this version deletes that list. Removing the extension
deletes all of its storage.

## Questions

Open an issue on the project page, https://github.com/ryangswe/kenbunshoku.
