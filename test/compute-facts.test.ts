// SPDX-License-Identifier: Apache-2.0
// The card facts of a remote release, from the compute frame to the tooltip frame (src/compute/facts.ts),
// on the toolkit's compute frame: sent for a shown card of the confirmed release only, and a
// tooltip's request answered only for a card this frame showed (Addendum 2).
import { describe, expect, it } from "vitest";

import { createShownFacts, SHOWN_IDS_LIMIT } from "../src/compute/facts.js";
import type { ReleaseInEffect } from "../vendor/cardvision-browser/compute-session.js";
import { card, remoteFrame, RID } from "./helpers/remote-frame.js";

const TABLE = { "999": ["New Card", null, "full/999.jpg"], "998": ["Never Shown", null, null], "997": ["Printed", "OP01", null, "OP01-001"] } as const;
const table = () => structuredClone(TABLE) as unknown as Parameters<typeof remoteFrame>[0];

describe("card facts on the toolkit's compute frame", () => {
  it("the release in effect carries the remote release's table once the worker confirms it", async () => {
    const t = await remoteFrame(table());
    expect(t.frame.release.table).toBeNull();
    t.confirm();
    expect(t.frame.release).toMatchObject({ source: "remote", id: RID, reason: "ok" });
    expect(t.frame.release.table?.["999"]).toEqual(["New Card", null, "full/999.jpg"]);
  });

  it("sends a shown card's facts, with the printed number when the table has one", async () => {
    const t = await remoteFrame(table());
    t.confirm();
    t.show(card("999"));
    t.show(card("997"));
    expect(t.posted).toEqual([
      { releaseId: RID, cardId: "999", facts: { name: "New Card", set: null, art: "full/999.jpg" } },
      { releaseId: RID, cardId: "997", facts: { name: "Printed", set: "OP01", art: null, printed: "OP01-001" } },
    ]);
  });

  it("sends nothing before the worker confirmed the release, for another release id, or for no card", async () => {
    const t = await remoteFrame(table());
    t.show(card("999"));
    t.confirm();
    t.show({ ...card("999"), releaseId: "ffffffffffffffff" });
    t.show(null);
    t.show({ ...card("999"), releaseId: undefined });
    expect(t.posted).toEqual([]);
  });

  it("answers a tooltip's request only for a card it showed, of its own release", async () => {
    const t = await remoteFrame(table());
    expect(t.shownFacts.factsFor(RID, "999")).toBeNull();
    t.confirm();
    expect(t.shownFacts.factsFor(RID, "999")).toBeNull();
    t.show(card("999"));
    expect(t.shownFacts.factsFor(RID, "999")).toEqual({ releaseId: RID, cardId: "999", facts: { name: "New Card", set: null, art: "full/999.jpg" } });
    expect(t.shownFacts.factsFor(RID, "998")).toBeNull();
    expect(t.shownFacts.factsFor("ffffffffffffffff", "999")).toBeNull();
  });

  it("answers nothing once a restart left the remote release for the bundled one", async () => {
    const t = await remoteFrame(table());
    t.confirm();
    t.show(card("999"));
    t.workers[0]!.fail("crash");
    expect(t.frame.release).toMatchObject({ source: "bundled", reason: "worker-restart", table: null });
    expect(t.shownFacts.factsFor(RID, "999")).toBeNull();
  });

  it("keeps the newest shown cards, at most SHOWN_IDS_LIMIT", () => {
    const rows: Record<string, [string, null, null]> = {};
    for (let i = 0; i <= SHOWN_IDS_LIMIT; i += 1) rows[`c${i}`] = [`Card ${i}`, null, null];
    const release: ReleaseInEffect = { source: "remote", id: RID, reason: "ok", table: rows };
    const facts = createShownFacts(() => undefined, () => release);
    for (let i = 0; i <= SHOWN_IDS_LIMIT; i += 1) facts.onShown(card(`c${i}`), release);
    expect(facts.factsFor(RID, "c0")).toBeNull();
    expect(facts.factsFor(RID, `c${SHOWN_IDS_LIMIT}`)).not.toBeNull();
    // Shown again: it is the newest, so it outlives the next one added.
    facts.onShown(card("c1"), release);
    expect(facts.factsFor(RID, "c1")).not.toBeNull();
  });
});
