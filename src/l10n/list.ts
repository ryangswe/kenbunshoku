// SPDX-License-Identifier: Apache-2.0
// The card list of one language's pictures (SETTINGS.md, "Card pictures in the viewer's
// language"): `{ "<card id>": "<file>" }`, downloaded from the address the settings file names
// and used only when its bytes have the SHA-256 the settings file gives. Each file is a plain
// name (letters, digits, `.`, `_`, `-`), filled into the language's template as {sourceFile}.

import type { ImageSource, LocalizedArt } from "../settings/schema.js";

/** A language's pictures, ready for the picture chain: its source and its card list. */
export interface LocalizedPictures {
  lang: string;
  listSha256: string;
  source: ImageSource;
  files: Record<string, string>;
}

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** The card list's entries; null when the list is not `{ "<card id>": "<plain file name>" }`. */
export function parseCardList(raw: unknown): Record<string, string> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [cardId, file] of Object.entries(raw)) {
    if (cardId.length === 0 || typeof file !== "string" || !FILE.test(file) || file.includes("..")) return null;
    out[cardId] = file;
  }
  return out;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Download and check a language's card list. Rejects when it cannot be used. */
export async function loadLocalizedPictures(lang: string, art: LocalizedArt, fetchFn: typeof fetch): Promise<LocalizedPictures> {
  const response = await fetchFn(art.list, { credentials: "omit", referrerPolicy: "no-referrer", cache: "default" });
  if (!response.ok) throw new Error(`card list: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if ((await sha256Hex(bytes)) !== art.listSha256) throw new Error("card list: SHA-256 mismatch");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("card list: not JSON");
  }
  const files = parseCardList(raw);
  if (!files) throw new Error("card list: not { card id: file }");
  return { lang, listSha256: art.listSha256, source: { id: `l10n-${lang}`, template: art.template }, files };
}
