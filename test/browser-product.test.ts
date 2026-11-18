// SPDX-License-Identifier: Apache-2.0
// test/browser/product.mjs, the module the toolkit's browser checks take with --product, still
// describes this extension: the harness accepts its shape, its test settings file passes this
// extension's own settings check, and its storage keys and outline marker are the ones this
// extension uses. CI's browser test runs in its own job and the rollback check only by hand, so
// these catch a drift in the unit tests first.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ENABLED_KEY, KEEP_CARD_KEY } from "../vendor/cardvision-browser/host-settings.js";
import { validateSettings } from "../src/settings/schema.js";
import { TAG } from "../src/shared/messages.js";
// @ts-expect-error plain JavaScript test modules
import PRODUCT from "./browser/product.mjs";
// @ts-expect-error plain JavaScript test modules
import { productProblems } from "../vendor/cardvision-browser/harness/product-shape.mjs";
// @ts-expect-error plain JavaScript test modules
import { CHECKS } from "../vendor/cardvision-browser/harness/clauses.mjs";

describe("test/browser/product.mjs", () => {
  it("has the shape the toolkit's harness takes", () => {
    expect(productProblems(PRODUCT, CHECKS)).toEqual([]);
  });

  it("serves a test settings file that this extension accepts", () => {
    // The harness serves the pictures from the settings host, as here.
    const host = new URL(PRODUCT.settingsUrl(JSON.parse(readFileSync(PRODUCT.config, "utf-8")))).host;
    const result = validateSettings(PRODUCT.testSettings(`https://${host}${PRODUCT.artPath("{art}")}`));
    expect(result.problems).toEqual([]);
    expect(result.settings).not.toBeNull();
  });

  it("runs every shared check, arrives-under-rest included", () => {
    // Without a return time for card C the harness marks arrives-under-rest unsupported, which
    // does not fail the run, and test/browser/LIVE-CHECKS.md would then claim a check that never ran.
    expect(PRODUCT.places.C.back).toBeGreaterThan(PRODUCT.places.C.until);
    expect(PRODUCT.unsupported).toEqual({});
  });

  it("names this extension's storage keys and outline marker", () => {
    expect(PRODUCT.keys).toEqual({ enabled: ENABLED_KEY, keepCard: KEEP_CARD_KEY });
    expect(PRODUCT.outlineSelector).toBe(`[data-${TAG}="outline"]`);
  });
});
