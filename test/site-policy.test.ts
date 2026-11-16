// SPDX-License-Identifier: Apache-2.0
// Which pages this extension serves, and when each loads, as the toolkit's hover host decides it
// (vendored host-settings.js, pagePolicy and allowedParentOrigin) for this extension's config
// (src/shared/product.ts). The host's own tests hold the whole address table of the hover spec
// (S-G3); these are this extension's rows, kept so that a change of the vendored host that moves
// one of them shows here.
import { describe, expect, it } from "vitest";

import { productConfig } from "../src/shared/product.js";
import { allowedParentOrigin, pagePolicy } from "../vendor/cardvision-browser/host-settings.js";

/** Both sites on, whatever the build's config turns on (the config's own sites: build-data.test.ts). */
const BOTH_SITES = { youtube: true, twitch: true };

/** "play": loads when the main video plays; "pointer": at the first trusted pointer over it;
 *  "off": no hovers on the page. */
function loads(url: string, dev: boolean, sites = BOTH_SITES): "play" | "pointer" | "off" {
  const policy = pagePolicy(new URL(url), { sites, dev });
  return policy.active ? policy.load : "off";
}

describe("the pages hovers run on (S-G1)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", false, true],
    ["https://www.youtube.com/embed/abc", false, true],
    ["https://www.youtube.com/live/abc", false, true],
    ["https://www.youtube.com/", false, false],
    ["https://www.youtube.com/results?search_query=one+piece", false, false],
    ["https://www.youtube.com/shorts/abc", false, false],
    ["https://www.youtube.com/@somechannel/live", false, true],
    ["https://www.youtube.com/@somechannel/live/", false, true],
    ["https://www.youtube.com/channel/UC123abc/live", false, true],
    ["https://www.youtube.com/c/SomeName/live", false, true],
    ["https://www.youtube.com/user/somename/live", false, true],
    ["https://www.youtube.com/@somechannel", false, false],
    ["https://www.youtube.com/@somechannel/videos", false, false],
    ["https://www.youtube.com/@a/b/live", false, false],
    ["https://www.youtube.com/feed/live", false, false],
    ["https://www.twitch.tv/somechannel", false, true],
    ["https://www.twitch.tv/videos/123", false, true],
    ["http://127.0.0.1:8770/", false, false],
    ["http://127.0.0.1:8770/", true, true],
    ["https://example.org/watch", true, false],
  ])("%s (dev %s) → %s", (url, dev, active) => expect(loads(url, dev) !== "off").toBe(active));

  it("serves only the sites the config turns on", () => {
    expect(loads("https://www.twitch.tv/somechannel", false, { youtube: true, twitch: false })).toBe("off");
    expect(loads("https://www.youtube.com/watch?v=abc", false, { youtube: false, twitch: true })).toBe("off");
  });

  it("is told this build's sites and dev flag by the product config", () => {
    const config = productConfig(false);
    expect(pagePolicy(new URL("http://127.0.0.1:8770/"), config).active).toBe(false);
    expect(pagePolicy(new URL("http://127.0.0.1:8770/"), productConfig(true)).active).toBe(true);
  });
});

// On YouTube every active page but an embedded player loads at play; on Twitch only a channel's
// page, a past broadcast or a clip. Other pages load at the first pointer over the video (S-G2,
// S-G3).
describe("when a page loads (S-G2, S-G3)", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", false, "play"],
    ["https://www.youtube.com/embed/abc", false, "pointer"],
    ["https://www.youtube.com/embed/abc?autoplay=1&mute=1", false, "pointer"],
    ["https://www.youtube.com/live/abc", false, "play"],
    ["https://www.youtube.com/@somechannel/live", false, "play"],
    ["https://www.youtube.com/", false, "off"],
    ["https://www.youtube.com/@somechannel", false, "off"],
    ["https://www.twitch.tv/somechannel", false, "play"],
    ["https://www.twitch.tv/somechannel/", false, "play"],
    ["https://www.twitch.tv/Some_Channel_42", false, "play"],
    ["https://www.twitch.tv/videos/123456789", false, "play"],
    ["https://www.twitch.tv/somechannel/clip/SomeClip-Ab_12", false, "play"],
    ["https://www.twitch.tv/somechannel?sr=a", false, "play"],
    ["https://www.twitch.tv/", false, "pointer"],
    ["https://www.twitch.tv/directory", false, "pointer"],
    ["https://www.twitch.tv/directory/category/one-piece-card-game", false, "pointer"],
    ["https://www.twitch.tv/directory/following", false, "pointer"],
    ["https://www.twitch.tv/search?term=one+piece", false, "pointer"],
    ["https://www.twitch.tv/settings", false, "pointer"],
    ["https://www.twitch.tv/Directory", false, "pointer"],
    ["https://www.twitch.tv/videos", false, "pointer"],
    ["https://www.twitch.tv/videos/abc", false, "pointer"],
    ["https://www.twitch.tv/Videos/123", false, "pointer"],
    ["https://www.twitch.tv/somechannel/videos", false, "pointer"],
    ["https://www.twitch.tv/somechannel/about", false, "pointer"],
    ["https://www.twitch.tv/somechannel/clips", false, "pointer"],
    ["https://www.twitch.tv/popout/somechannel/player", false, "pointer"],
    ["https://www.twitch.tv/popout/somechannel/chat", false, "pointer"],
    ["https://www.twitch.tv/moderator/somechannel", false, "pointer"],
    ["https://www.twitch.tv/a-b", false, "pointer"],
    // Two of the spec's seven side pages, which load at a pointer like the rest of Twitch's own
    // pages (until this extension moved to the host, they loaded at play as if channels).
    ["https://www.twitch.tv/following", false, "pointer"],
    ["https://www.twitch.tv/creatorcamp", false, "pointer"],
    ["http://127.0.0.1:8770/", true, "play"],
    ["http://127.0.0.1:8770/", false, "off"],
  ])("%s (dev %s) → %s", (url, dev, expected) => expect(loads(url, dev)).toBe(expected));
});

describe("the pages that may embed the extension's frames (S-B9)", () => {
  it("accepts the video sites as parents, and the local test page only in a dev build", () => {
    const off = { sites: BOTH_SITES, dev: false };
    const dev = { sites: BOTH_SITES, dev: true };
    expect(allowedParentOrigin("https://www.youtube.com", off)).toBe(true);
    expect(allowedParentOrigin("https://www.twitch.tv", off)).toBe(true);
    expect(allowedParentOrigin("https://evil.example", off)).toBe(false);
    expect(allowedParentOrigin("http://www.youtube.com", off)).toBe(false);
    expect(allowedParentOrigin("http://127.0.0.1:8770", off)).toBe(false);
    expect(allowedParentOrigin("http://127.0.0.1:8770", dev)).toBe(true);
    expect(allowedParentOrigin("http://127.0.0.1.evil.example", dev)).toBe(false);
    // localhost: a second local site for the smoke check, dev builds only.
    expect(allowedParentOrigin("http://localhost:8770", off)).toBe(false);
    expect(allowedParentOrigin("http://localhost:8770", dev)).toBe(true);
    expect(allowedParentOrigin("http://localhost.evil.example", dev)).toBe(false);
  });

  it("accepts only the sites turned on", () => {
    expect(allowedParentOrigin("https://www.youtube.com", { sites: { youtube: true, twitch: false }, dev: false })).toBe(true);
    expect(allowedParentOrigin("https://www.twitch.tv", { sites: { youtube: true, twitch: false }, dev: false })).toBe(false);
    expect(allowedParentOrigin("https://www.youtube.com", { sites: { youtube: false, twitch: true }, dev: false })).toBe(false);
    expect(allowedParentOrigin("https://www.twitch.tv", { sites: { youtube: false, twitch: true }, dev: false })).toBe(true);
  });
});
