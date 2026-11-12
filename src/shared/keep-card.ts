// SPDX-License-Identifier: Apache-2.0
// The popup's "Keep the card I'm pointing at" switch (owner, 2026-11-12). On unless switched
// off. On, a shown card stays while the pointer stays on it, even after the card moves or another
// card is laid on top (the toolkit's reading hold); off, a card laid on top replaces it after a
// moment, with no pointer move (the toolkit's shown hold, as in 0.4.1). The compute frame reads
// it when it starts (session-options.ts); a change remakes a running compute frame (agent.ts).

import type { KeyValueStorage } from "../settings/store.js";

export const KEEP_CARD_KEY = "keepCard";

/** A stored value as the switch's state: anything but `false` is on. */
export function keepCardOn(value: unknown): boolean {
  return value !== false;
}

/** Whether a storage change turns the switch over: a write of the same state (or a missing value
 *  written as true) does not, so it does not remake the compute frame. */
export function keepCardChanged(change: { oldValue?: unknown; newValue?: unknown } | undefined): boolean {
  return change !== undefined && keepCardOn(change.newValue) !== keepCardOn(change.oldValue);
}

export async function readKeepCard(storage: Pick<KeyValueStorage, "get">): Promise<boolean> {
  return keepCardOn((await storage.get(KEEP_CARD_KEY))[KEEP_CARD_KEY]);
}
