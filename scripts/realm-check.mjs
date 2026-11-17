// SPDX-License-Identifier: Apache-2.0
// Runs the toolkit's realm check on a built extension. The check is vendored with the toolkit's
// Node tools (vendor/cardvision-browser/node/realm-check.mjs). It fails when one built file holds
// twice one of the runtime modules that the toolkit marks, which would give that file two copies
// of the module's state. `npm run build` and `npm run package` run it and fail when it does.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REALM_CHECK = join(root, "vendor", "cardvision-browser", "node", "realm-check.mjs");

/** Checks `dir`. `ok` is true only when the check exits 0; `message` is what it printed. */
export function realmCheck(dir) {
  const result = spawnSync(process.execPath, [REALM_CHECK, dir], { encoding: "utf-8" });
  const message = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || String(result.error ?? "no output");
  return { ok: result.status === 0, message };
}
