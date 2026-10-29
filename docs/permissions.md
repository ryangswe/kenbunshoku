<!-- SPDX-License-Identifier: Apache-2.0 -->
# Permissions

What each browser permission Kenbunshoku asks for is used for. What it reads, sends and keeps is in [PRIVACY.md](../PRIVACY.md).

*[Back to README](../README.md)*

| Permission | Why |
| --- | --- |
| Read and change your data on `www.youtube.com` and `www.twitch.tv` | On supported pages, the extension reads the video's picture only around your pointer activity over the video (nothing before the pointer comes over it), and shows the card beside it. The permission also covers `www.youtube.com` player frames embedded in other websites, where card hovers work the same way with no step to turn them on; the surrounding website is not read. |
| `cdn.kenbunshoku.com`, `optcgapi.com` | To load the settings file, card pictures and the card-feature file, and, from `cdn.kenbunshoku.com` only, updated card-recognition data when new cards are published (data files, never code: the extension's code never comes from the CDN). |
| Storage and unlimited storage | Storage keeps the on/off switch, the card size, the last settings file, a dismissed update notice and the id of updated recognition data that failed its checks (ignored after 24 hours), on your computer. Unlimited storage lets the extension keep its approximately 60 MB card-feature cache without the normal quota and eviction limits. It does not give the extension access to any other website. |

It does not request the tabs or history permissions. Its content scripts run only on the
supported YouTube and Twitch pages and player frames listed in [Where it works](using.md#where-it-works).
