// SPDX-License-Identifier: Apache-2.0
// Which pages the extension attaches to. The content script is loaded on every page of the video
// sites the config turns on (YouTube and Twitch navigate without reloading), and attaches only
// where this says so.

import { type VideoSites } from "../config.js";
import { VIDEO_SITES } from "../constants.js";

/** A channel's live page, which holds the watch player while the channel is live. */
const CHANNEL_LIVE = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/live\/?$/;

/** YouTube: a watch page, a channel's live page, a live page or an embedded player. Twitch: every page (live channels,
 *  videos and clips all play in one player). The local test page in a dev build. */
export function isActivePage(url: URL, dev: boolean, sites: VideoSites = VIDEO_SITES): boolean {
  if (sites.youtube && url.protocol === "https:" && url.hostname === "www.youtube.com") {
    return url.pathname === "/watch" || url.pathname.startsWith("/embed/") || url.pathname.startsWith("/live/") || CHANNEL_LIVE.test(url.pathname);
  }
  if (sites.twitch && url.protocol === "https:" && url.hostname === "www.twitch.tv") return true;
  return dev && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

/** Twitch addresses whose first part is a site page, not a channel. */
const TWITCH_SITE_PAGES = new Set([
  "bits", "broadcast", "collections", "directory", "downloads", "drops", "friends", "inventory", "jobs", "messages", "moderator",
  "p", "payments", "popout", "prime", "privacy", "products", "search", "settings", "store", "subscriptions", "team", "turbo", "u",
  "videos", "wallet",
]);
/** A Twitch channel's page (its live stream, or what the channel plays there), a past broadcast
 *  (`/videos/<id>`) or a clip. */
const TWITCH_PLAYER_PAGE = /^\/(?:videos\/\d+|([A-Za-z0-9_]{1,25})(?:\/clip\/[A-Za-z0-9_-]+)?)\/?$/;

/** Whether a video playing on this page loads card hovers, or only the pointer does. YouTube: every
 *  active page but an embedded player (`/embed/`), which on another website may be a muted video
 *  that plays by itself, so it loads at the first pointer move (owner, 2026-11-12: "Wait for a
 *  hover"). Twitch: a channel's page, a past broadcast or a clip. Elsewhere on Twitch (the front
 *  page's featured stream, a directory's previews, a channel's player shrunk while you browse, a
 *  moderator's view with its small player) a video plays without being what you came to watch, or
 *  not as the page's main picture, so card hovers load there when you first point at a video, as
 *  before. So do the rarer player-only pages (a popout player), which keeps the list short. The
 *  main video is picked by size, and a featured stream is the largest video on its page, so the
 *  page decides this, not the size.
 *
 *  Twitch changes pages without reloading. A video still playing from the page before, with no new
 *  `playing` event, does not load at play on the new page; the first pointer move over it does. */
export function loadsAtPlay(url: URL, dev: boolean, sites: VideoSites = VIDEO_SITES): boolean {
  if (!isActivePage(url, dev, sites)) return false;
  if (url.hostname === "www.youtube.com") return !url.pathname.startsWith("/embed/");
  if (url.hostname !== "www.twitch.tv") return true;
  const page = TWITCH_PLAYER_PAGE.exec(url.pathname);
  return page !== null && (page[1] === undefined || !TWITCH_SITE_PAGES.has(page[1].toLowerCase()));
}
