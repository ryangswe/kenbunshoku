// SPDX-License-Identifier: Apache-2.0
// What this extension tells the hover host passes the host's own config check, in a development
// build and in a store build. The check rejects unknown keys at every level, so a key the host does
// not read fails here rather than being ignored.

import { describe, expect, it } from "vitest";
import { productConfigError } from "../vendor/cardvision-browser/host-settings.js";
import { productConfig } from "../src/shared/product.js";

describe("productConfig", () => {
  it.each([true, false])("passes the host's config check (dev %s)", (dev) => {
    expect(productConfigError(productConfig(dev))).toBeNull();
  });

  it("would be refused with a key the host does not read", () => {
    const config = { ...productConfig(false), extra: 1 };
    expect(productConfigError(config)).toMatch(/unknown key/);
  });
});
