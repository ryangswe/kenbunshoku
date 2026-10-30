// SPDX-License-Identifier: Apache-2.0
// The card facts a tooltip shows, from files the build writes beside the release:
//   data/cards.json         { "<card id>": [name, set, art path or null, printed number?] }, from
//                           the catalog (the printed number only with the "catalog" rule)
//   data/source-files.json  the `{sourceFile}` map, { "<source id>": { "<card id>": "<file>" } }

import type { SourceFileMaps } from "../settings/templates.js";

export interface CardFacts {
  id: string;
  name: string;
  set: string | null;
  art: string | null;
  printed?: string | null;
}

/** The table the build writes to data/cards.json, by the toolkit's rule (vendored remote-release.js). */
export type { CardTable } from "../../vendor/cardvision-browser/remote-release.js";

/** Check the shape of a `{sourceFile}` map; anything else is treated as no map. */
export function parseSourceFileMaps(raw: unknown): SourceFileMaps {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const maps: SourceFileMaps = {};
  for (const [sourceId, files] of Object.entries(raw)) {
    if (typeof files !== "object" || files === null || Array.isArray(files)) continue;
    const map: Record<string, string> = {};
    for (const [cardId, file] of Object.entries(files)) if (typeof file === "string" && file.length > 0) map[cardId] = file;
    maps[sourceId] = map;
  }
  return maps;
}
