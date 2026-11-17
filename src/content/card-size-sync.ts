// SPDX-License-Identifier: Apache-2.0
// Keeps the tooltip adapter's card size equal to the popup's card-size dial: the stored value at
// start, then each change to it. A card on show is fitted again at once through the host's
// relayout(), so the viewer sees the new size without pointing at another card.

import type { HostContent } from "../../vendor/cardvision-browser/host-content.js";
import type { StorageChanges } from "../../vendor/cardvision-browser/host-settings.js";
import { CARD_SIZE_KEY, clampCardSize, readCardSize } from "../shared/card-size.js";

/** The part of the tooltip adapter that holds the card size. True when the size changed. */
interface SizedView {
  setCardSize(percent: number): boolean;
}

/** Reads the stored card size into `view`, and follows its changes in chrome.storage.local.
 *  Returns the stop. */
export function syncCardSize(
  view: SizedView,
  host: Pick<HostContent, "relayout">,
  storage: { get(keys: string | string[]): Promise<Record<string, unknown>> },
  changes: StorageChanges,
): () => void {
  const apply = (percent: number): void => {
    if (view.setCardSize(percent)) host.relayout();
  };
  void readCardSize(storage).then(apply, () => undefined);
  const listener: Parameters<StorageChanges["addListener"]>[0] = (changed, area) => {
    if (area === "local" && CARD_SIZE_KEY in changed) apply(clampCardSize(changed[CARD_SIZE_KEY]?.newValue));
  };
  changes.addListener(listener);
  return () => changes.removeListener(listener);
}
