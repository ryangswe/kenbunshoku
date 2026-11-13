// SPDX-License-Identifier: Apache-2.0
// The popup's "Keep the card I'm pointing at" switch (shared/keep-card.ts): on unless switched
// off. Like the main switch, it is still until the stored state is read, so that a press never
// inverts a state that was never shown, and it slides only on later changes. Each press is
// stored at once; a running compute frame is then made again with the new hold (agent.ts).

import { KEEP_CARD_KEY, readKeepCard } from "../shared/keep-card.js";

interface Area {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** Fill the switch and keep it current. Returns its render function, for storage changes. */
export function initKeepCard(doc: Document, local: Area): { render(): Promise<void> } {
  const toggle = doc.getElementById("keep-card") as HTMLButtonElement;
  const show = (on: boolean): void => toggle.setAttribute("aria-checked", on ? "true" : "false");
  let ready = false;
  const render = async (): Promise<void> => {
    // A storage that cannot be read shows the default (on) rather than a switch stuck disabled.
    show(await readKeepCard(local).catch(() => true));
    if (ready) return;
    ready = true;
    toggle.disabled = false;
    toggle.removeAttribute("aria-busy");
    // As the main switch: the first state is drawn first, and transitions come on two frames later.
    const knob = toggle.querySelector(".knob");
    if (knob) void doc.defaultView?.getComputedStyle(knob).transform;
    const win = doc.defaultView;
    const frame = win?.requestAnimationFrame ? (f: () => void) => win.requestAnimationFrame(() => f()) : (f: () => void) => setTimeout(f, 16);
    frame(() => frame(() => toggle.setAttribute("data-ready", "")));
  };
  // A button with role="switch": Enter and Space press it like a click.
  toggle.addEventListener("click", () => {
    if (!ready) return;
    const on = toggle.getAttribute("aria-checked") !== "true";
    show(on);
    void local.set({ [KEEP_CARD_KEY]: on }).catch(() => undefined);
  });
  void render();
  return { render };
}
