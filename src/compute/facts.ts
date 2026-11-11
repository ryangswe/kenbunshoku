// SPDX-License-Identifier: Apache-2.0
// The card facts of a remote release, from the compute frame to the tooltip frame.
//
// The toolkit's compute frame (startComputeFrame) calls `onShown(card, release)` before it posts
// each shown card to the content script. When the card comes from a remote release the worker
// confirmed, its facts (name, set, art, printed number) are sent first, over the extension-only
// facts channel (FACTS_CHANNEL), never through the page. A tooltip frame that lacks a card's facts
// (one made again, or a card that arrived before its facts) asks on the channel; it is answered
// only for cards this frame showed, of the release still in effect (nothing a page could ask for).
// A tooltip with no answer falls back to the bundled table.

import type { ReleaseInEffect, ShownCard } from "../../vendor/cardvision-browser/compute-session.js";
import type { CardFactsMessage } from "../shared/messages.js";

/** Cards this frame has shown, kept to answer a tooltip's facts request (oldest dropped first). */
export const SHOWN_IDS_LIMIT = 256;

export interface ShownFacts {
  /** Hand to startComputeFrame's `onShown`. */
  onShown(card: ShownCard | null, release: ReleaseInEffect): void;
  /** A tooltip's request: the facts of a card this frame showed, of the release in effect; null otherwise. */
  factsFor(releaseId: string, cardId: string): CardFactsMessage | null;
}

export function createShownFacts(postFacts: (message: CardFactsMessage) => void, releaseNow: () => ReleaseInEffect): ShownFacts {
  const shownIds = new Set<string>();

  const rowFacts = (release: ReleaseInEffect, releaseId: string, cardId: string): CardFactsMessage | null => {
    const table = release.table;
    if (release.source !== "remote" || release.id !== releaseId || !table || !Object.hasOwn(table, cardId)) return null;
    const row = table[cardId]!;
    return { releaseId, cardId, facts: { name: row[0], set: row[1], art: row[2], ...(row.length > 3 ? { printed: row[3] ?? null } : {}) } };
  };

  return {
    onShown(card, release) {
      if (!card?.releaseId) return;
      const facts = rowFacts(release, card.releaseId, card.cardId);
      if (!facts) return;
      shownIds.delete(facts.cardId);
      shownIds.add(facts.cardId);
      while (shownIds.size > SHOWN_IDS_LIMIT) shownIds.delete(shownIds.values().next().value as string);
      postFacts(facts);
    },
    factsFor(releaseId, cardId) {
      return shownIds.has(cardId) ? rowFacts(releaseNow(), releaseId, cardId) : null;
    },
  };
}
