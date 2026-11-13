// @vitest-environment happy-dom
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { PROJECT_URL, RUNTIME_URL, UPDATE_URL_PREFIX } from "../src/constants.js";
import { CONFIG } from "./helpers/fork.js";
import { initPopup } from "../src/popup/view.js";
import { memoryStorage } from "./helpers/memory-storage.js";

const HTML = `<span id="name"></span><button id="enabled" role="switch" aria-checked="false" aria-busy="true" disabled></button>
<fieldset id="hover-settings" disabled><select id="card-language" aria-busy="true" disabled></select><input id="card-size" type="range" disabled><output id="card-size-value"></output><button id="keep-card" role="switch" aria-checked="false" aria-busy="true" disabled><span class="knob"></span></button></fieldset>
<p id="update" hidden><a id="update-link"></a><button id="update-dismiss"></button></p>
<a id="project"></a><a id="runtime"></a>`;

const settle = () => new Promise((r) => setTimeout(r, 0));
const listenersOf = () => {
  const listeners: Array<(c: Record<string, unknown>, a: string) => void> = [];
  return { listeners, onChanged: { addListener: (l: (c: Record<string, unknown>, a: string) => void) => void listeners.push(l) } };
};

beforeEach(() => {
  document.body.innerHTML = HTML;
});

describe("popup", () => {
  it("shows the master switch and turns it off and on", async () => {
    const local = memoryStorage();
    const { listeners, onChanged } = listenersOf();
    initPopup({ doc: document, local, onChanged, version: "0.1.0" });
    await settle();
    const toggle = document.getElementById("enabled")!;
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    toggle.click();
    await settle();
    expect(local.data.enabled).toBe(false);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();
    await settle();
    expect(local.data.enabled).toBe(true);
    expect(listeners).toHaveLength(1);
  });

  it("holds the switch until the stored state is read: no press, then no slide into place", async () => {
    const local = memoryStorage({ enabled: false });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow = { ...local, get: async (k: string | string[] | null) => (await gate, local.get(k)), set: local.set };
    initPopup({ doc: document, local: slow, onChanged: listenersOf().onChanged, version: "0.1.0" });
    const toggle = document.getElementById("enabled") as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    toggle.disabled = false; // even if the press got through, it must not act on an unread state
    toggle.click();
    toggle.disabled = true;
    await settle();
    expect(local.data.enabled).toBe(false);
    expect(toggle.hasAttribute("data-ready")).toBe(false);
    release();
    await settle();
    await settle();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.disabled).toBe(false);
    expect(toggle.hasAttribute("aria-busy")).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(toggle.hasAttribute("data-ready")).toBe(true);
    toggle.click();
    await settle();
    expect(local.data.enabled).toBe(true);
  });

  it("shows the default (on) and enables the switch when the storage cannot be read", async () => {
    const local = memoryStorage();
    const broken = { ...local, get: async () => Promise.reject(new Error("storage unavailable")), set: local.set };
    initPopup({ doc: document, local: broken, onChanged: listenersOf().onChanged, version: "0.1.0" });
    await settle();
    await settle();
    const toggle = document.getElementById("enabled") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.disabled).toBe(false);
  });

  it("turns transitions on only after the first state has been drawn, and never for reduced motion", async () => {
    const css = readFileSync(resolve(process.cwd(), "static/popup.css"), "utf-8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.switch\[data-ready\] \.knob[^{]*\{ transition: none; \}/);
    const frames: Array<() => void> = [];
    const win = document.defaultView as Window & typeof globalThis;
    const original = win.requestAnimationFrame;
    win.requestAnimationFrame = (f: FrameRequestCallback) => (frames.push(() => f(0)), frames.length);
    try {
      document.body.innerHTML = HTML.replace('aria-busy="true" disabled></button>', 'aria-busy="true" disabled><span class="knob"></span></button>');
      initPopup({ doc: document, local: memoryStorage(), onChanged: listenersOf().onChanged, version: "0.1.0" });
      await settle();
      // Both switches: the main one and "Keep the card I'm pointing at".
      const toggles = ["enabled", "keep-card"].map((id) => document.getElementById(id)!);
      // One animation frame: every callback queued before it runs, none queued during it.
      const animationFrame = () => frames.splice(0).forEach((f) => f());
      for (const toggle of toggles) expect(toggle.getAttribute("aria-checked")).toBe("true");
      for (const toggle of toggles) expect(toggle.hasAttribute("data-ready")).toBe(false);
      animationFrame();
      for (const toggle of toggles) expect(toggle.hasAttribute("data-ready")).toBe(false);
      animationFrame();
      for (const toggle of toggles) expect(toggle.hasAttribute("data-ready")).toBe(true);
    } finally {
      win.requestAnimationFrame = original;
    }
  });

  it("follows the switch when it changes elsewhere", async () => {
    const local = memoryStorage();
    const { listeners, onChanged } = listenersOf();
    initPopup({ doc: document, local, onChanged, version: "0.1.0" });
    await settle();
    local.data.enabled = false;
    listeners[0]!({ enabled: { newValue: false } }, "local");
    await settle();
    expect(document.getElementById("enabled")!.getAttribute("aria-checked")).toBe("false");
  });

  describe("Keep the card I'm pointing at", () => {
    const keep = () => document.getElementById("keep-card") as HTMLButtonElement;

    it("is on by default, and each press is stored at once", async () => {
      const local = memoryStorage();
      initPopup({ doc: document, local, onChanged: listenersOf().onChanged, version: "0.1.0" });
      await settle();
      expect(keep().getAttribute("aria-checked")).toBe("true");
      expect(keep().disabled).toBe(false);
      expect(keep().hasAttribute("aria-busy")).toBe(false);
      keep().click();
      expect(keep().getAttribute("aria-checked")).toBe("false");
      await settle();
      expect(local.data.keepCard).toBe(false);
      keep().click();
      await settle();
      expect(local.data.keepCard).toBe(true);
      expect(keep().getAttribute("aria-checked")).toBe("true");
    });

    it("shows a stored off, and follows a change made elsewhere", async () => {
      const local = memoryStorage({ keepCard: false });
      const { listeners, onChanged } = listenersOf();
      initPopup({ doc: document, local, onChanged, version: "0.1.0" });
      await settle();
      expect(keep().getAttribute("aria-checked")).toBe("false");
      local.data.keepCard = true;
      listeners[0]!({ keepCard: { oldValue: false, newValue: true } }, "local");
      await settle();
      expect(keep().getAttribute("aria-checked")).toBe("true");
    });

    it("stays still until the stored state is read, and shows on when the storage cannot be read", async () => {
      const local = memoryStorage({ keepCard: false });
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const slow = { ...local, get: async (k: string | string[] | null) => (await gate, local.get(k)), set: local.set };
      initPopup({ doc: document, local: slow, onChanged: listenersOf().onChanged, version: "0.1.0" });
      expect(keep().disabled).toBe(true);
      keep().disabled = false; // even if the press got through, it must not act on an unread state
      keep().click();
      keep().disabled = true;
      await settle();
      expect(local.data.keepCard).toBe(false);
      release();
      await settle();
      expect(keep().getAttribute("aria-checked")).toBe("false");
      expect(keep().disabled).toBe(false);

      document.body.innerHTML = HTML;
      const broken = { get: () => Promise.reject(new Error("no storage")), set: () => Promise.resolve() };
      initPopup({ doc: document, local: broken, onChanged: listenersOf().onChanged, version: "0.1.0" });
      await settle();
      expect(keep().getAttribute("aria-checked")).toBe("true");
      expect(keep().disabled).toBe(false);
    });

    it("sits with the settings that are dimmed while card hovers are off, in the owner's words", () => {
      const html = readFileSync(resolve(process.cwd(), "static/popup.html"), "utf-8");
      // The panel alone: the page's style sheet and script are not loaded here.
      document.body.innerHTML = html.slice(html.indexOf("<main"), html.indexOf("</main>") + "</main>".length);
      const toggle = keep();
      expect(toggle.closest("#hover-settings")).not.toBeNull();
      expect(toggle.getAttribute("role")).toBe("switch");
      expect(toggle.disabled).toBe(true);
      expect(document.getElementById(toggle.getAttribute("aria-labelledby")!)!.textContent).toBe("Keep the card I'm pointing at");
      expect(document.getElementById(toggle.getAttribute("aria-describedby")!)!.textContent).toBe("A card laid on top won't replace it until you move.");
    });
  });

  it("shows the stored card size on its dial, 70 % to 130 % in steps of 10 %, 100 % by default", async () => {
    initPopup({ doc: document, local: memoryStorage(), onChanged: listenersOf().onChanged, version: "0.1.0" });
    const slider = document.getElementById("card-size") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(["70", "130", "10"]);
    await settle();
    expect(slider.disabled).toBe(false);
    expect(slider.value).toBe("100");
    expect(document.getElementById("card-size-value")!.textContent).toBe("100%");
    expect(slider.getAttribute("aria-valuetext")).toBe("100%");

    document.body.innerHTML = HTML;
    initPopup({ doc: document, local: memoryStorage({ cardSize: 120 }), onChanged: listenersOf().onChanged, version: "0.1.0" });
    await settle();
    expect((document.getElementById("card-size") as HTMLInputElement).value).toBe("120");
    expect(document.getElementById("card-size-value")!.textContent).toBe("120%");

    // A stored value out of range or between steps is shown clamped and stepped.
    document.body.innerHTML = HTML;
    initPopup({ doc: document, local: memoryStorage({ cardSize: 500 }), onChanged: listenersOf().onChanged, version: "0.1.0" });
    await settle();
    expect(document.getElementById("card-size-value")!.textContent).toBe("130%");
  });

  it("stores each step of the dial at once, and follows a change made elsewhere", async () => {
    const local = memoryStorage();
    const { listeners, onChanged } = listenersOf();
    initPopup({ doc: document, local, onChanged, version: "0.1.0" });
    await settle();
    const slider = document.getElementById("card-size") as HTMLInputElement;
    slider.value = "80";
    slider.dispatchEvent(new Event("input"));
    await settle();
    expect(local.data.cardSize).toBe(80);
    expect(document.getElementById("card-size-value")!.textContent).toBe("80%");
    local.data.cardSize = 110;
    listeners[0]!({ cardSize: { newValue: 110 } }, "local");
    await settle();
    expect(slider.value).toBe("110");
    expect(document.getElementById("card-size-value")!.textContent).toBe("110%");
    expect(listeners).toHaveLength(1);
  });

  it("keeps the dial still until the stored size is read", async () => {
    const local = memoryStorage({ cardSize: 120 });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow = { ...local, get: async (k: string | string[] | null) => (await gate, local.get(k)), set: local.set };
    initPopup({ doc: document, local: slow, onChanged: listenersOf().onChanged, version: "0.1.0" });
    const slider = document.getElementById("card-size") as HTMLInputElement;
    expect(slider.disabled).toBe(true);
    slider.value = "70";
    slider.dispatchEvent(new Event("input"));
    await settle();
    expect(local.data.cardSize).toBe(120);
    release();
    await settle();
    await settle();
    expect(slider.disabled).toBe(false);
    expect(slider.value).toBe("120");
  });

  it("dims and disables the settings under the switch while card hovers are off, and keeps their values", async () => {
    const local = memoryStorage({ enabled: false, cardSize: 120 });
    const { listeners, onChanged } = listenersOf();
    initPopup({ doc: document, local, onChanged, version: "0.1.0" });
    const group = document.getElementById("hover-settings") as HTMLFieldSetElement;
    const slider = document.getElementById("card-size") as HTMLInputElement;
    // Before the switch's state is read: not usable, but not dimmed either (no gray flash on open).
    expect(group.disabled).toBe(true);
    expect(group.hasAttribute("data-off")).toBe(false);
    await settle();
    expect(group.disabled).toBe(true);
    expect(group.hasAttribute("data-off")).toBe(true);
    expect(slider.value).toBe("120");
    // Turned on here: usable at once, at the size kept.
    document.getElementById("enabled")!.click();
    expect(group.disabled).toBe(false);
    expect(group.hasAttribute("data-off")).toBe(false);
    await settle();
    expect(local.data.enabled).toBe(true);
    expect(slider.value).toBe("120");
    // Turned off here: dimmed and disabled at once; the stored size is left as it is.
    document.getElementById("enabled")!.click();
    expect(group.disabled).toBe(true);
    expect(group.hasAttribute("data-off")).toBe(true);
    await settle();
    expect(local.data.cardSize).toBe(120);
    // Turned on elsewhere (another popup): follows it.
    local.data.enabled = true;
    listeners[0]!({ enabled: { newValue: true } }, "local");
    await settle();
    expect(group.disabled).toBe(false);
    expect(group.hasAttribute("data-off")).toBe(false);
  });

  it("dims the settings with a transition only after the first state is drawn, and never for reduced motion", () => {
    const css = readFileSync(resolve(process.cwd(), "static/popup.css"), "utf-8");
    expect(css).toMatch(/\.group\[data-off\] \{ opacity: 0\.45; \}/);
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.group\[data-ready\] \{ transition: none; \}/);
  });

  it("names the extension as the config does", () => {
    initPopup({ doc: document, local: memoryStorage(), onChanged: listenersOf().onChanged, version: "0.1.0" });
    expect(document.getElementById("name")!.textContent).toBe(CONFIG.name);
    expect(document.title).toBe(CONFIG.name);
  });

  it.runIf(UPDATE_URL_PREFIX !== null)("shows the new-version line only when the settings name a newer version", async () => {
    // The built-in default (cdn/config.json) may name the latest version: a version past any it can name.
    initPopup({ doc: document, local: memoryStorage(), onChanged: listenersOf().onChanged, version: "99.0.0" });
    await settle();
    expect(document.getElementById("update")!.hidden).toBe(true);
    document.body.innerHTML = HTML;
    const config = {
      schemaVersion: 1, updatedAt: "2026-10-16T00:00:00Z", namesOnly: false, primary: null, fallbacks: [], cardLink: null,
      update: { latest: "0.2.0", url: `${UPDATE_URL_PREFIX}/tag/v0.2.0` },
    };
    const local = memoryStorage({ "settings.lastGood": { raw: config, fetchedAt: 1 } });
    initPopup({ doc: document, local, onChanged: listenersOf().onChanged, version: "0.1.0" });
    await settle();
    expect(document.getElementById("update")!.hidden).toBe(false);
    expect(document.getElementById("update-link")!.textContent).toBe("New version available (0.2.0)");
    document.getElementById("update-dismiss")!.click();
    await settle();
    expect(document.getElementById("update")!.hidden).toBe(true);
  });

  it.runIf(UPDATE_URL_PREFIX !== null)("never shows the new-version line in the Firefox build", async () => {
    const config = {
      schemaVersion: 1, updatedAt: "2026-10-16T00:00:00Z", namesOnly: false, primary: null, fallbacks: [], cardLink: null,
      update: { latest: "0.2.0", url: `${UPDATE_URL_PREFIX}/tag/v0.2.0` },
    };
    const local = memoryStorage({ "settings.lastGood": { raw: config, fetchedAt: 1 } });
    initPopup({ doc: document, local, onChanged: listenersOf().onChanged, version: "0.1.0", updateNotices: false });
    await settle();
    expect(document.getElementById("update")!.hidden).toBe(true);
  });

  it("links the project page and the toolkit it is built on", () => {
    initPopup({ doc: document, local: memoryStorage(), onChanged: listenersOf().onChanged, version: "0.1.0" });
    expect((document.getElementById("project") as HTMLAnchorElement).href).toBe(new URL(PROJECT_URL).href);
    expect((document.getElementById("runtime") as HTMLAnchorElement).href).toBe(new URL(RUNTIME_URL).href);
  });

  describe("card language menu", () => {
    const HOST = CONFIG.imageHosts[0];
    const fileWith = (extra: Record<string, unknown>) => ({
      schemaVersion: 1, updatedAt: "2026-11-09T00:00:00Z", namesOnly: false, primary: null, fallbacks: [], cardLink: null, update: null, ...extra,
    });
    const french = HOST ? { fr: { template: `https://${HOST}/l10n/fr/{sourceFile}`, list: `https://${HOST}/l10n/fr/list.json`, listSha256: "a".repeat(64) } } : {};
    const stored = (raw: unknown) => ({ "settings.lastGood": { raw, fetchedAt: 1 } });
    const menu = () => document.getElementById("card-language") as HTMLSelectElement;
    const entries = () => [...menu().options].map((o) => [o.value, o.textContent, o.lang]);

    it("offers Automatic and English when the settings offer no other language", async () => {
      initPopup({ doc: document, local: memoryStorage(stored(fileWith({}))), onChanged: listenersOf().onChanged, version: "0.1.0", languages: () => ["de-DE"] });
      await settle();
      expect(entries()).toEqual([["auto", "Automatic (English)", "en"], ["en", "English", "en"]]);
      expect(menu().value).toBe("auto");
      expect(menu().disabled).toBe(false);
      expect(menu().hasAttribute("aria-busy")).toBe(false);
    });

    it.runIf(HOST !== undefined)("names each offered language in its own language, and Automatic names the one it picks", async () => {
      initPopup({ doc: document, local: memoryStorage(stored(fileWith({ localizedArt: french }))), onChanged: listenersOf().onChanged, version: "0.1.0", languages: () => ["ja", "fr-CA"] });
      await settle();
      expect(entries()).toEqual([["auto", "Automatic (Français)", "en"], ["en", "English", "en"], ["fr", "Français", "fr"]]);
    });

    it.runIf(HOST !== undefined)("stores a choice at once, and follows a choice made elsewhere", async () => {
      const local = memoryStorage(stored(fileWith({ localizedArt: french })));
      const { listeners, onChanged } = listenersOf();
      initPopup({ doc: document, local, onChanged, version: "0.1.0", languages: () => ["fr-FR"] });
      await settle();
      menu().value = "en";
      menu().dispatchEvent(new Event("change"));
      await settle();
      expect(local.data.cardLanguage).toBe("en");
      local.data.cardLanguage = "fr";
      listeners[0]!({ cardLanguage: { newValue: "fr" } }, "local");
      await settle();
      expect(menu().value).toBe("fr");
      expect(listeners).toHaveLength(1);
    });

    it.runIf(HOST !== undefined)("shows a choice the settings stop offering as Automatic, keeps it stored, and shows it again when it comes back", async () => {
      const local = memoryStorage({ ...stored(fileWith({})), cardLanguage: "fr" });
      const { listeners, onChanged } = listenersOf();
      initPopup({ doc: document, local, onChanged, version: "0.1.0", languages: () => ["en-US"] });
      await settle();
      expect(menu().value).toBe("auto");
      expect(entries().map(([v]) => v)).toEqual(["auto", "en"]);
      expect(local.data.cardLanguage).toBe("fr");
      Object.assign(local.data, stored(fileWith({ localizedArt: french })));
      listeners[0]!({ "settings.lastGood": { newValue: local.data["settings.lastGood"] } }, "local");
      await settle();
      expect(menu().value).toBe("fr");
    });

    it.runIf(HOST !== undefined)("offers no other language while the settings show names only", async () => {
      initPopup({ doc: document, local: memoryStorage(stored(fileWith({ namesOnly: true, localizedArt: french }))), onChanged: listenersOf().onChanged, version: "0.1.0", languages: () => ["fr-FR"] });
      await settle();
      expect(entries()).toEqual([["auto", "Automatic (English)", "en"], ["en", "English", "en"]]);
    });

    it("keeps the menu still until the stored choice is read", async () => {
      const local = memoryStorage({ cardLanguage: "en" });
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => (release = r));
      const slow = { ...local, get: async (k: string | string[] | null) => (await gate, local.get(k)), set: local.set };
      initPopup({ doc: document, local: slow, onChanged: listenersOf().onChanged, version: "0.1.0" });
      expect(menu().disabled).toBe(true);
      expect(menu().getAttribute("aria-busy")).toBe("true");
      const option = document.createElement("option");
      option.value = "auto";
      menu().append(option);
      menu().value = "auto";
      menu().dispatchEvent(new Event("change"));
      await settle();
      expect(local.data.cardLanguage).toBe("en");
      release();
      await settle();
      await settle();
      expect(menu().value).toBe("en");
      expect(menu().disabled).toBe(false);
    });

    it("shows Automatic with English alone when the storage cannot be read", async () => {
      const local = memoryStorage();
      const broken = { ...local, get: async () => Promise.reject(new Error("storage unavailable")), set: local.set };
      initPopup({ doc: document, local: broken, onChanged: listenersOf().onChanged, version: "0.1.0", languages: () => ["fr-FR"] });
      await settle();
      await settle();
      expect(entries().map(([v]) => v)).toEqual(["auto", "en"]);
      expect(menu().disabled).toBe(false);
    });
  });
});
