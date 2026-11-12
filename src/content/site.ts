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
/** A Twitch channel's page (its live stream, or what the channel plays there), a clip, or a video. */
const TWITCH_PLAYER_PAGE = /^\/(?:videos\/\d+|([A-Za-z0-9_]{1,25})(?:\/clip\/[A-Za-z0-9_-]+)?)\/?$/;

/** Whether a video playing on this page loads card hovers, or only the pointer does. YouTube: every
 *  active page. Twitch: a channel's page, a clip or a video. Elsewhere on Twitch (the front page's
 *  featured stream, a directory's previews, a channel's player shrunk while you browse) a video
 *  plays without being what you came to watch, so card hovers load there when you first point at
 *  a video, as before. */
export function loadsAtPlay(url: URL, dev: boolean, sites: VideoSites = VIDEO_SITES): boolean {
  if (!isActivePage(url, dev, sites)) return false;
  if (url.hostname !== "www.twitch.tv") return true;
  const page = TWITCH_PLAYER_PAGE.exec(url.pathname);
  return page !== null && (page[1] === undefined || !TWITCH_SITE_PAGES.has(page[1].toLowerCase()));
}
