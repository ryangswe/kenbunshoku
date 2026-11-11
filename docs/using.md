<!-- SPDX-License-Identifier: Apache-2.0 -->
# Using Kenbunshoku

How card hovers work once the extension is installed, what to expect, and how to update or remove it. To install it, see the [README](../README.md#install).

*[Back to README](../README.md)*

## Where it works

- Runs on supported YouTube and Twitch pages: YouTube watch pages, live pages and embedded
  players served from `www.youtube.com` (including those frames on other websites, without
  reading the surrounding website), and Twitch live channels and past broadcasts on
  `www.twitch.tv`. Other embedding addresses, such as `youtube-nocookie.com` or
  `player.twitch.tv`, are not supported.
- No streamer setup is needed. It recognizes supported cards from the video picture, in your
  browser.
- Hover only: it shows a card when you point at one, and stays out of the way otherwise. It can
  leave uncertain matches blank. It can also miss cards or show an incorrect match.

## Turning card hovers on and off

Card hovers are on for all supported videos, embedded YouTube players on other websites
included: open a One Piece Card Game video on YouTube or Twitch and point at a card. Nothing is
analyzed and nothing is downloaded for card hovers before the pointer comes over a video, so a
video you just watch costs nothing. When the pointer first comes over a video, even one
with no cards, card hovers start there (see [When recognition runs](#when-recognition-runs)). To
turn card hovers off everywhere, use the switch in Kenbunshoku's toolbar popup; there is no
per-channel switch. The extension separately checks its settings file when it is installed or
updated and when the browser starts, and at most once an hour while you use it.

## Hovering a card

Then rest the pointer on a face-up card. After a moment a thin outline marks the card it recognized,
and its picture appears beside it, placed off the cards around it where it can (smaller when the
window is short). Move to another card to see that one, even one under the picture shown: the
pointer passes through it, and nothing on it can be clicked. When there is no picture, the
card's name shows instead. Pausing works too, on recorded videos and on live streams.

The picture is Bandai's official one. When Bandai publishes the card in your card language, the
picture is in that language, and otherwise it is in English. French pictures arrived in version
0.4.0. The popup's **Card language** menu sets the language, and by default it
follows your browser.

## The toolbar popup

Kenbunshoku's toolbar popup has the main on/off switch, **Card hovers**: turned off, it analyzes
no video, on any page, until you turn it back on. It does not stop the settings check above.

**Card language** sets the language of the card pictures. **Automatic**, the default, goes through
the languages in your browser's language settings in order and takes the first one that is English
or that Kenbunshoku has pictures in. For example, Japanese and then French gives French pictures,
and English and then French gives English ones. You can also pick English, or any other language
in the menu, whatever your browser's settings. Each language is named in its own language. The
menu lists the languages Kenbunshoku offers today, so a new one can appear without an update. If
a language you picked stops being offered, the pictures follow your browser until it comes back,
and your choice is kept. The menu changes only the card pictures, and the popup itself stays
in English.

**Card size** sets how large the card's picture is shown, from 70% to 130% of its usual size
(100% unless you change it). A card on show changes size at once. The picture still stays inside
the window and beside the card, so in a small window it can be smaller than the size you set.
While card hovers are off, card language and card size are grayed out and can't be changed. They
keep your choices for when you turn card hovers back on.

Below them are two links, to the project page and to the open-source toolkit it is built on.

## When recognition runs

The first time you point at a video in a tab, the recognition model starts, which takes a
moment. Recognition runs only while the pointer is over the video, and stops by itself 10 seconds after
you stop moving it, unless a card is showing under the resting pointer, and always 60 seconds after
you last moved it. It stops at once when
the pointer leaves the video or the tab goes to the background.

After 10 minutes in which you have not moved the pointer over the video and no card has been
showing, Kenbunshoku unloads the recognition model in that tab to give its memory back. A pointer
resting on a paused video counts as not moving. The next time you point at the video, the model
starts again, as the first time does. Its files come from the extension itself or from the
browser's caches.

## Extra accuracy (WebGPU)

In a browser that has WebGPU, Kenbunshoku is designed to
also check the card under the pointer against the card art's shapes, which tells close-looking
cards apart better. It checks the card you point at first, so that card shows sooner, and a card
it hasn't checked yet shows nothing until it has. On a paused video it then checks the other
cards in the picture too, which takes about a second; a move to another card after that is
answered from those checks. The check runs only when it loads successfully and stays on: it turns itself off when it
fails or is too slow. For it, Kenbunshoku downloads a card-feature file of about 60 MB from
`cdn.kenbunshoku.com` once, the first time card hovers start on a video (on YouTube or Twitch,
even one with no cards), and caches it in the browser's storage; it is downloaded again if that storage is cleared or the file changes. Without
WebGPU it works without the extra check. Each tab
in which you have hovered a video holds its own copy of the card features in memory, about
60–70 MB, until the tab is closed or navigates away, or until the model is unloaded after 10 idle
minutes (above).

## Known limitations

- A card face down, a card mostly covered, or a picture too small or too blurred may show
  nothing: Kenbunshoku leaves uncertain matches blank. It can also miss cards or show an
  incorrect match.
- On a Twitch channel that shows a Twitch Extension over the video, that extension's frame
  takes the pointer, and Kenbunshoku sees no pointer there.
- A scene cut without a seek is caught at the next analysis, not at once, so a card can stay up
  to a second or two after the picture under it changes.

How often it is right, and what it does not recognize, is in [accuracy.md](accuracy.md).

## Updating and removing

**Installs from the Chrome Web Store or addons.mozilla.org update themselves.** The browser installs
new versions on its own, and your settings stay. The rest of this section, up to removing it, is
about installs from a release zip (Chrome only).

Switching from a zip install to the Web Store: the two are separate extensions to Chrome, so
remove the zip install after you install from the store.

Every install from a release zip has the same extension ID (`igfdjmpikcbplijnlpkligaafepgoaaa`).
That alone does not keep settings: they are kept only when you update in place, as below.

**To update and keep your settings**, download the new zip and unzip it, replace the contents of
your existing Kenbunshoku folder with the contents of the new one, then click the circular
**Reload** arrow on Kenbunshoku's card in `chrome://extensions`. When a newer version is out,
Kenbunshoku's popup says "New version available" with a link.

**To remove it**, click **Remove** on its card in `chrome://extensions` in Chrome, or choose
**Remove** from its **⋯** menu in `about:addons` in Firefox. Removing the extension
deletes its saved settings (the on/off switch, the card language and the card size);
installing it again starts fresh.
