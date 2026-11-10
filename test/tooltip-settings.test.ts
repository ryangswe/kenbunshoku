// @vitest-environment happy-dom
// SPDX-License-Identifier: Apache-2.0
// The tooltip frame when the settings are read again while a card is on show. The hourly refresh
// stores a new copy even when the file has not changed, and a real change (a release day) shows the
// card again with the new settings. The placeholder is never left in place.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import type { Settings } from "../src/settings/schema.js";
import { CACHE_LIMIT, FACTS_LIMIT, TooltipController, type TooltipDeps, type TooltipElements } from "../src/tooltip/controller.js";
import type { TooltipSize } from "../src/shared/messages.js";

const defaultSettings = (): Settings => ({
  schemaVersion: 1,
  updatedAt: "2026-10-16T00:00:00Z",
  namesOnly: false,
  primary: { id: "art", template: "https://art.example/art/{art}" },
  fallbacks: [],
  update: null,
  geometric: true,
});

const table = {
  "OP01-001": ["Roronoa Zoro", "OP01", "OP01-001.jpg"],
  don_8: ["DON!! Card", "DON!!", "don_8.png"],
  wide: ["A Wide Card", "X", "wide.png"],
  "OP01-002": ["Trafalgar Law", "OP01", "OP01-002.jpg"],
  "OP01-003": ["Monkey.D.Luffy", "OP01", "OP01-003.jpg"],
} as const;

const PAGE = /<body>([\s\S]*)<\/body>/.exec(readFileSync(resolve(process.cwd(), "static/tooltip.html"), "utf-8"))![1]!;

let elements: TooltipElements;
let loads: string[];
let sizes: TooltipSize[];
let failing: Set<string>;
let release: (() => void) | null;
let controller: TooltipController;

function build(extra: Partial<TooltipDeps> = {}): TooltipController {
  document.body.innerHTML = PAGE;
  const $ = (id: string) => document.getElementById(id)!;
  elements = { root: $("card"), art: $("art"), img: $("img") as HTMLImageElement, placeholder: $("placeholder"), pill: $("pill") };
  loads = [];
  sizes = [];
  failing = new Set();
  release = null;
  return new TooltipController({
    elements,
    table: table as never,
    maps: {},
    load: async (url) => {
      loads.push(url);
      if (release) await new Promise<void>((r) => (release = r));
      if (failing.has(url)) throw new Error("404");
      return new Blob([url]);
    },
    imageSize: async () => ({ width: 600, height: 838 }),
    requestRefresh: () => undefined,
    onSize: (size) => void sizes.push(size),
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => undefined,
    ...extra,
  });
}

const tick = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** The picture on show: decoded, in place of the placeholder. */
const showsPicture = (): boolean =>
  !elements.root.hidden && !elements.art.hidden && !elements.art.classList.contains("loading") && elements.pill.hidden && elements.img.getAttribute("src") === "blob:fake";

beforeEach(() => {
  controller = build();
  controller.setSettings(defaultSettings());
});

describe("settings read again while a card is on show", () => {
  it("goes on loading the picture when the hourly refresh stores the same settings again", async () => {
    release = () => undefined;
    controller.show("OP01-001", 3);
    await tick();
    const loaded = release!;
    release = null;
    // The refresh that show() asked for stores a new copy; the frame reads it back as a new object.
    controller.setSettings(defaultSettings());
    loaded();
    await tick();
    expect(showsPicture()).toBe(true);
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg"]);
    expect(sizes.at(-1)).toMatchObject({ shape: "card", cardId: "OP01-001", seq: 3, width: 320, height: 447 });
  });

  it("treats settings with the same contents in another key order as the same", async () => {
    release = () => undefined;
    controller.show("OP01-001");
    await tick();
    const loaded = release!;
    release = null;
    controller.setSettings(Object.fromEntries(Object.entries(defaultSettings()).reverse()) as unknown as Settings);
    loaded();
    await tick();
    expect(showsPicture()).toBe(true);
    expect(loads).toHaveLength(1);
  });

  it("keeps the pictures already loaded when the settings are the same", async () => {
    let revoked = 0;
    controller = build({ revokeObjectURL: () => void (revoked += 1) });
    controller.setSettings(defaultSettings());
    controller.show("OP01-001");
    await tick();
    controller.setSettings(defaultSettings());
    controller.show("don_8");
    await tick();
    controller.show("OP01-001");
    await tick();
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg", "https://art.example/art/don_8.png"]);
    expect(revoked).toBe(0);
  });

  it("still tries every source again when the settings are the same (the hourly retry of a failing source)", async () => {
    const primary = "https://art.example/art/";
    const withSpare = (): Settings => ({ ...defaultSettings(), fallbacks: [{ id: "spare", template: "https://spare.example/{art}" }] });
    controller.setSettings(withSpare());
    for (const id of ["OP01-001", "don_8", "wide", "OP01-002"]) failing.add(`${primary}${table[id as keyof typeof table][2]}`);
    for (const id of ["OP01-001", "don_8", "wide"]) {
      controller.show(id);
      await tick();
    }
    // Three failures: the primary is skipped for the next card.
    controller.show("OP01-002");
    await tick();
    expect(loads.filter((u) => u.startsWith(primary))).toHaveLength(3);
    controller.setSettings(withSpare());
    controller.show("OP01-003");
    await tick();
    // The primary is asked again, and gives the picture.
    expect(loads.at(-1)).toBe(`${primary}OP01-003.jpg`);
    expect(loads.filter((u) => u.startsWith(primary))).toHaveLength(4);
  });

  it("shows the card again with changed settings when they change while its picture loads", async () => {
    release = () => undefined;
    controller.show("OP01-001", 5);
    await tick();
    const stale = release!;
    release = null;
    controller.setSettings({ ...defaultSettings(), primary: { id: "new", template: "https://new.example/{art}" } });
    await tick();
    // The old settings' picture arrives late and is not used.
    stale();
    await tick();
    expect(showsPicture()).toBe(true);
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg", "https://new.example/OP01-001.jpg"]);
    expect(controller.current).toBe("OP01-001");
    expect(sizes.at(-1)).toMatchObject({ shape: "card", cardId: "OP01-001", seq: 5 });
  });

  it("shows the card again when only the release changes (a release day), with its picture", async () => {
    release = () => undefined;
    controller.setSettings({ ...defaultSettings(), release: { id: "0123456789abcdef", minVersion: "0.3.0" } });
    controller.show("OP01-001", 6);
    await tick();
    const stale = release!;
    release = null;
    controller.setSettings({ ...defaultSettings(), release: { id: "fedcba9876543210", minVersion: "0.3.0" } });
    stale();
    await tick();
    expect(showsPicture()).toBe(true);
    expect(elements.img.alt).toBe("Roronoa Zoro");
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg", "https://art.example/art/OP01-001.jpg"]);
    expect(sizes.at(-1)).toMatchObject({ shape: "card", cardId: "OP01-001", seq: 6, width: 320, height: 447 });
  });

  it("turns the card on show into its name at once when the settings change to names only", async () => {
    controller.show("OP01-001", 8);
    await tick();
    expect(showsPicture()).toBe(true);
    controller.setSettings({ ...defaultSettings(), namesOnly: true });
    expect(elements.pill.hidden).toBe(false);
    expect(elements.art.hidden).toBe(true);
    expect(sizes.at(-1)).toMatchObject({ shape: "pill", cardId: "OP01-001", seq: 8 });
  });

  it("shows nothing and loads nothing when the settings change with no card on show", async () => {
    controller.show("OP01-001");
    await tick();
    controller.clear();
    const count = sizes.length;
    controller.setSettings({ ...defaultSettings(), namesOnly: true });
    await tick();
    expect(elements.root.hidden).toBe(true);
    expect(controller.current).toBeNull();
    expect(sizes).toHaveLength(count);
    expect(loads).toHaveLength(1);
  });

  it("keeps a remote release's card and its facts when the settings change", async () => {
    const rid = "0123456789abcdef";
    controller.addFacts(rid, { id: "OP99-001", name: "New Card", set: null, art: "OP99-001.jpg" });
    controller.show("OP99-001", 2, rid);
    await tick();
    controller.setSettings({ ...defaultSettings(), primary: { id: "new", template: "https://new.example/{art}" } });
    await tick();
    expect(showsPicture()).toBe(true);
    expect(elements.img.alt).toBe("New Card");
    expect(loads.at(-1)).toBe("https://new.example/OP99-001.jpg");
    expect(sizes.at(-1)).toMatchObject({ cardId: "OP99-001", seq: 2 });
  });

  it("keeps a remote release's card on show when its facts were dropped from the channel's store", async () => {
    const rid = "0123456789abcdef";
    controller.addFacts(rid, { id: "OP99-001", name: "New Card", set: null, art: "OP99-001.jpg" });
    controller.show("OP99-001", 2, rid);
    await tick();
    for (let i = 0; i < FACTS_LIMIT; i += 1) controller.addFacts(rid, { id: `OP99-${1000 + i}`, name: "Other", set: null, art: "x.jpg" });
    controller.setSettings({ ...defaultSettings(), primary: { id: "new", template: "https://new.example/{art}" } });
    await tick();
    expect(controller.current).toBe("OP99-001");
    expect(showsPicture()).toBe(true);
    expect(elements.img.alt).toBe("New Card");
    expect(loads.at(-1)).toBe("https://new.example/OP99-001.jpg");
  });

  it("keeps the facts of the card on show when the page shows it again after they were dropped", async () => {
    const rid = "0123456789abcdef";
    controller.addFacts(rid, { id: "OP99-001", name: "New Card", set: null, art: "OP99-001.jpg" });
    controller.show("OP99-001", 2, rid);
    await tick();
    for (let i = 0; i < FACTS_LIMIT; i += 1) controller.addFacts(rid, { id: `x${i}`, name: "Other", set: null, art: "x.jpg" });
    expect(controller.show("OP99-001", 3, rid)).toBe(true);
    expect(controller.current).toBe("OP99-001");
    expect(elements.placeholder.textContent).toBe("New Card");
    // Shown under another release, the dropped facts are not used.
    expect(controller.show("OP99-001", 4, "fedcba9876543210")).toBe(false);
  });

  it("shows the card on show again for a change in any field, even one pictures do not use", async () => {
    controller.show("OP01-001", 4);
    await tick();
    expect(showsPicture()).toBe(true);
    const before = sizes.length;
    controller.setSettings({ ...defaultSettings(), updatedAt: "2026-11-06T00:00:00Z" });
    // Its placeholder at once, then its picture again.
    expect(elements.art.classList.contains("loading")).toBe(true);
    await tick();
    expect(showsPicture()).toBe(true);
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg", "https://art.example/art/OP01-001.jpg"]);
    expect(sizes.slice(before)).toEqual([
      { width: 320, height: 447, shape: "card", cardId: "OP01-001", seq: 4 },
      { width: 320, height: 447, shape: "card", cardId: "OP01-001", seq: 4 },
    ]);
  });

  it("keeps a picture a fallback gave when the same settings are read again; new pictures try the primary first", async () => {
    const withSpare = (): Settings => ({ ...defaultSettings(), fallbacks: [{ id: "spare", template: "https://spare.example/{art}" }] });
    controller.setSettings(withSpare());
    failing.add("https://art.example/art/OP01-001.jpg");
    controller.show("OP01-001");
    await tick();
    failing.clear();
    controller.setSettings(withSpare());
    controller.show("don_8");
    await tick();
    controller.show("OP01-001");
    await tick();
    expect(showsPicture()).toBe(true);
    expect(loads).toEqual(["https://art.example/art/OP01-001.jpg", "https://spare.example/OP01-001.jpg", "https://art.example/art/don_8.png"]);
  });
});

describe("pictures in the viewer's language that arrive while a picture loads", () => {
  const french = {
    lang: "fr",
    listSha256: "a".repeat(64),
    source: { id: "fr", template: "https://fr.example/{sourceFile}" },
    files: { "OP01-001": "OP01-001_fr.png" },
  };
  let made: Map<string, Blob>;
  let revoked: string[];
  /** A tooltip whose object URLs say which picture they were made from. */
  const withUrls = () => {
    made = new Map();
    revoked = [];
    const c = build({
      createObjectURL: (blob) => {
        const url = `blob:${made.size}`;
        made.set(url, blob);
        return url;
      },
      revokeObjectURL: (url) => void revoked.push(url),
    });
    c.setSettings(defaultSettings());
    return c;
  };
  /** The address of the picture on show. */
  const shownFrom = async () => made.get(elements.img.getAttribute("src") ?? "")?.text();

  it("shows the new language's picture on the next show of a card whose old picture was still loading", async () => {
    controller = withUrls();
    release = () => undefined;
    controller.show("OP01-001", 1);
    await tick();
    const english = release!;
    release = null;
    // The French list arrives (start-up), then the English picture already asked for.
    controller.setLocalized(french);
    english();
    await tick();
    expect(await shownFrom()).toBe("https://art.example/art/OP01-001.jpg");
    controller.show("don_8", 2);
    await tick();
    controller.show("OP01-001", 3);
    await tick();
    expect(await shownFrom()).toBe("https://fr.example/OP01-001_fr.png");
    // The English picture's URL is let go, not leaked.
    expect(revoked).toContain("blob:0");
  });

  it("lets go of every URL when the settings change or the language's pictures do", async () => {
    controller = withUrls();
    controller.show("OP01-001", 1);
    await tick();
    controller.setSettings({ ...defaultSettings(), updatedAt: "2026-11-06T00:00:00Z" });
    expect(revoked).toEqual(["blob:0"]);
    await tick();
    controller.setLocalized(french);
    expect(revoked).toEqual(["blob:0", "blob:1"]);
  });

  it("lets go of the URL of a picture that leaves the cache", async () => {
    controller = withUrls();
    const rid = "0123456789abcdef";
    for (let i = 0; i <= CACHE_LIMIT; i += 1) {
      const id = `OP99-${100 + i}`;
      controller.addFacts(rid, { id, name: id, set: null, art: `${id}.jpg` });
      controller.show(id, i, rid);
      await tick();
    }
    expect(revoked).toEqual(["blob:0"]);
  });

  it("never lets a superseded picture replace, or let go of, the picture on show", async () => {
    let sized: (() => void) | null = null;
    let holdSize = true;
    made = new Map();
    revoked = [];
    controller = build({
      imageSize: async () => {
        if (holdSize) await new Promise<void>((r) => (sized = r));
        return { width: 600, height: 838 };
      },
      createObjectURL: (blob) => {
        const url = `blob:${made.size}`;
        made.set(url, blob);
        return url;
      },
      revokeObjectURL: (url) => void revoked.push(url),
    });
    controller.setSettings(defaultSettings());
    controller.show("OP01-001", 1);
    await tick();
    const english = sized!;
    holdSize = false;
    controller.setLocalized(french);
    controller.show("don_8", 2);
    await tick();
    controller.show("OP01-001", 3);
    await tick();
    const onShow = elements.img.getAttribute("src");
    expect(await shownFrom()).toBe("https://fr.example/OP01-001_fr.png");
    const before = [...revoked];
    // The first show's English picture finishes sizing only now.
    english();
    await tick();
    expect(elements.img.getAttribute("src")).toBe(onShow);
    expect(revoked).toEqual(before);
  });

  it("uses a picture's URL again for the same picture", async () => {
    controller = withUrls();
    controller.show("OP01-001", 1);
    await tick();
    controller.show("don_8", 2);
    await tick();
    controller.show("OP01-001", 3);
    await tick();
    expect(elements.img.getAttribute("src")).toBe("blob:0");
    expect(made.size).toBe(2);
    expect(revoked).toEqual([]);
  });
});
