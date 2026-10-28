// SPDX-License-Identifier: Apache-2.0
// Shot metadata written by scripts/build-footage.py (crop size, per-frame pointer in crop pixels).
import hero from "../public/footage/hero.json";
import hero9 from "../public/footage/hero9.json";
import m1 from "../public/footage/m1-kaido.json";
import m2 from "../public/footage/m2-sanji.json";
import m3 from "../public/footage/m3-nami.json";
import store from "../public/footage/store-ace.json";
import m4 from "../public/footage/m4-mihawk.json";
import m5 from "../public/footage/m5-xebec.json";

export type ShotMeta = { id: string; w: number; h: number; frames: number; pointer: number[][] };

export const SHOT_META: Record<string, ShotMeta> = Object.fromEntries(
  [hero, hero9, m1, m2, m3, m4, m5, store].map((m) => [m.id, m as ShotMeta]),
);
