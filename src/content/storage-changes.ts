// SPDX-License-Identifier: Apache-2.0
// What the content script does when the popup's settings change in chrome.storage.local: the
// main switch, the card size, and "Keep the card I'm pointing at", which remakes a running
// compute frame only when it turns over (the frame reads it itself when it starts).

import { ENABLED_KEY } from "../shared/enabled.js";
import { CARD_SIZE_KEY, clampCardSize } from "../shared/card-size.js";
import { KEEP_CARD_KEY, keepCardChanged } from "../shared/keep-card.js";

/** The agent's side of a settings change (agent.ts). */
export interface SettingsTarget {
  setEnabled(enabled: boolean): void;
  setCardSize(percent: number): void;
  restartForKeepCard(): void;
}

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown } | undefined>;

export function applyStorageChanges(agent: SettingsTarget, changes: Changes, area: string): void {
  if (area !== "local") return;
  if (ENABLED_KEY in changes) agent.setEnabled(changes[ENABLED_KEY]?.newValue !== false);
  if (CARD_SIZE_KEY in changes) agent.setCardSize(clampCardSize(changes[CARD_SIZE_KEY]?.newValue));
  if (KEEP_CARD_KEY in changes && keepCardChanged(changes[KEEP_CARD_KEY])) agent.restartForKeepCard();
}
