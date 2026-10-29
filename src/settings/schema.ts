// SPDX-License-Identifier: Apache-2.0
// The settings file, schema version 1 (SETTINGS.md), and its validation.
//
// A file is either usable or not. It is not usable when it is not a JSON object, when
// `schemaVersion` is not exactly 1, or when a required field is missing or of the wrong type;
// the caller then keeps its last good copy (store.ts). Inside a usable file, a single source
// can still be dropped, and the rest kept:
//   - a template that is not an absolute https:// URL;
//   - a template with a placeholder this extension does not know;
//   - a template whose host is not one the extension may request images from (IMAGE_HOSTS);
//   - a primary that uses {sourceFile} (our CDN is keyed by {art}).
// Unknown extra fields are ignored, among them the obsolete `cardLink` (the tooltip no longer
// has a link; files may still carry it, of any type). The optional `update` field (an addition proposed for
// unpacked installs) is read when it is well formed and ignored otherwise. The optional `release` field
// (the remote release pointer, SETTINGS.md) is kept as written: src/release/pointer.ts and
// src/release/geometric.ts judge it where it is used, and a malformed one never makes the file
// unusable. The optional `localizedArt` field (card pictures in the viewer's language) keeps each
// well-formed language and drops the rest; it never makes the file unusable either.

import { IMAGE_HOSTS, UPDATE_URL_PREFIX } from "../constants.js";
import { templateProblem } from "./templates.js";

export interface ImageSource {
  id: string;
  template: string;
}

export interface UpdateNotice {
  /** The newest released version, `x.y.z`. */
  latest: string;
  /** Where to get it: an https:// address. */
  url: string;
}

/** Card pictures in one language (SETTINGS.md, "Card pictures in the viewer's language"). */
export interface LocalizedArt {
  /** The picture address: an https:// template on an image host that uses {sourceFile}. */
  template: string;
  /** The address of the card list, `{ "<card id>": "<file>" }`: the cards that have a picture
   *  in this language. A card not on it shows the usual picture. */
  list: string;
  /** The list's SHA-256 (lowercase hex): a list with other bytes is not used. */
  listSha256: string;
}

export interface Settings {
  schemaVersion: 1;
  updatedAt: string;
  namesOnly: boolean;
  primary: ImageSource | null;
  fallbacks: ImageSource[];
  update: UpdateNotice | null;
  /** The geometric stage (extra accuracy). Optional in the file; absent means on. `false` turns
   *  it off without a release. */
  geometric: boolean;
  /** The `release` field as written (null when absent); see src/release/pointer.ts. */
  release?: unknown;
  /** Card pictures by language (`fr`, `ja`…); empty when the file offers none. */
  localizedArt?: Record<string, LocalizedArt>;
}

export interface Validation {
  /** The usable settings, or null when the file is not usable. */
  settings: Settings | null;
  /** Why the file is not usable, or which parts of it were dropped. For logs only. */
  problems: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A source object's shape; null when it is not `{ id: non-empty string, template: string }`. */
function sourceShape(value: unknown): ImageSource | null {
  if (!isObject(value)) return null;
  const { id, template } = value;
  if (typeof id !== "string" || id.length === 0 || typeof template !== "string") return null;
  return { id, template };
}

/** Why an image source cannot be used (it is dropped), or null when it can. */
export function imageSourceProblem(source: ImageSource, allowedHosts: readonly string[] = IMAGE_HOSTS): string | null {
  const problem = templateProblem(source.template);
  if (problem) return problem;
  const host = new URL(source.template.replace(/\{[A-Za-z]+\}/g, "x")).hostname;
  if (!allowedHosts.includes(host)) return `host ${host} is not one this extension may request images from`;
  return null;
}

const VERSION = /^\d+\.\d+\.\d+$/;

/** Whether an address is the prefix itself or a path, query or fragment below it. */
export function underPrefix(href: string, prefix: string): boolean {
  if (!href.startsWith(prefix)) return false;
  const next = href.charAt(prefix.length);
  return next === "" || next === "/" || next === "?" || next === "#";
}

function updateField(value: unknown, problems: string[]): UpdateNotice | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value) || typeof value.latest !== "string" || typeof value.url !== "string") {
    problems.push("update: ignored (not { latest, url })");
    return null;
  }
  if (!VERSION.test(value.latest)) {
    problems.push("update: ignored (latest is not x.y.z)");
    return null;
  }
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    problems.push("update: ignored (url is not an address)");
    return null;
  }
  if (url.protocol !== "https:") {
    problems.push("update: ignored (url is not https://)");
    return null;
  }
  if (UPDATE_URL_PREFIX === null || !underPrefix(url.href, UPDATE_URL_PREFIX)) {
    problems.push(UPDATE_URL_PREFIX === null ? "update: ignored (this build shows no update notice)" : `update: ignored (url is not under ${UPDATE_URL_PREFIX})`);
    return null;
  }
  return { latest: value.latest, url: url.href };
}

function geometricField(value: unknown, problems: string[]): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "boolean") return value;
  problems.push("geometric: ignored (not true or false); the stage stays on");
  return true;
}

/** A language key: a lowercase base subtag (`fr`, `ja`), never `en` (English is the usual picture). */
const LANGUAGE = /^[a-z]{2,3}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function localizedArtField(value: unknown, allowedHosts: readonly string[], problems: string[]): Record<string, LocalizedArt> {
  const out: Record<string, LocalizedArt> = {};
  if (value === undefined || value === null) return out;
  if (!isObject(value)) {
    problems.push("localizedArt: ignored (not an object)");
    return out;
  }
  for (const [lang, entry] of Object.entries(value)) {
    const drop = (why: string): void => void problems.push(`localizedArt.${lang} dropped: ${why}`);
    if (!LANGUAGE.test(lang) || lang === "en") {
      drop("not a lowercase language code other than en");
      continue;
    }
    if (!isObject(entry) || typeof entry.template !== "string" || typeof entry.list !== "string" || typeof entry.listSha256 !== "string") {
      drop("not { template, list, listSha256 }");
      continue;
    }
    const problem = imageSourceProblem({ id: `l10n-${lang}`, template: entry.template }, allowedHosts);
    if (problem) {
      drop(problem);
      continue;
    }
    if (!entry.template.includes("{sourceFile}")) {
      drop("the template does not use {sourceFile}");
      continue;
    }
    let list: URL;
    try {
      list = new URL(entry.list);
    } catch {
      drop("list is not an address");
      continue;
    }
    if (list.protocol !== "https:" || !allowedHosts.includes(list.hostname)) {
      drop("list is not https:// on an image host");
      continue;
    }
    if (!SHA256.test(entry.listSha256)) {
      drop("listSha256 is not 64 lowercase hex characters");
      continue;
    }
    out[lang] = { template: entry.template, list: list.href, listSha256: entry.listSha256 };
  }
  return out;
}

/** Validate a parsed settings file. */
export function validateSettings(raw: unknown, allowedHosts: readonly string[] = IMAGE_HOSTS): Validation {
  const fail = (problem: string): Validation => ({ settings: null, problems: [problem] });
  if (!isObject(raw)) return fail("not a JSON object");
  if (raw.schemaVersion !== 1) return fail("schemaVersion is not 1");
  if (typeof raw.namesOnly !== "boolean") return fail("namesOnly is not true or false");
  if (typeof raw.updatedAt !== "string") return fail("updatedAt is not a string");
  if (!("primary" in raw)) return fail("primary is missing");
  if (!Array.isArray(raw.fallbacks)) return fail("fallbacks is not an array");

  let primary: ImageSource | null = null;
  if (raw.primary !== null) {
    primary = sourceShape(raw.primary);
    if (!primary) return fail("primary is not { id, template } or null");
  }
  const fallbacks: ImageSource[] = [];
  for (const [i, value] of raw.fallbacks.entries()) {
    const source = sourceShape(value);
    if (!source) return fail(`fallbacks[${i}] is not { id, template }`);
    fallbacks.push(source);
  }

  const problems: string[] = [];
  if (primary) {
    const problem = primary.template.includes("{sourceFile}") ? "the primary may not use {sourceFile}" : imageSourceProblem(primary, allowedHosts);
    if (problem) {
      problems.push(`primary dropped: ${problem}`);
      primary = null;
    }
  }
  const kept = fallbacks.filter((source, i) => {
    const problem = imageSourceProblem(source, allowedHosts);
    if (problem) problems.push(`fallbacks[${i}] dropped: ${problem}`);
    return problem === null;
  });
  return {
    settings: {
      schemaVersion: 1,
      updatedAt: raw.updatedAt,
      namesOnly: raw.namesOnly,
      primary,
      fallbacks: kept,
      update: updateField(raw.update, problems),
      geometric: geometricField(raw.geometric, problems),
      release: raw.release === undefined ? null : raw.release,
      localizedArt: localizedArtField(raw.localizedArt, allowedHosts, problems),
    },
    problems,
  };
}
