// SPDX-License-Identifier: Apache-2.0
// Every cut and reveal sits on the music edit (scripts/make-audio.mjs), 30 fps.
// The track runs at ~131.9 BPM: one beat = 13.65 frames, one bar = 54.6 frames.
export const FPS = 30;
export const TOTAL = 796; // 26.533 s, the audio's length

export const T = {
  fadeIn: 0,
  click: 135, // 4.50 s: the eye button click, on a beat
  reveal: 232, // 7.74 s: the first art lands on the "mic drop" hit (source 15.02 s)
  ringOut: 286, // the hit's 2-bar ring-out: push in on the card
  drop: 341, // 11.375 s: the main section drops, the montage starts
  end: 613, // 20.45 s: the track's final hit, the end card
};

export type Shot = { id: string; from: number; to: number; tag: "Digital" | "Physical" };

// Five hovers, one bar each; each card's art lands one beat into its shot.
export const MONTAGE: Shot[] = [
  { id: "m1-kaido", from: 341, to: 396, tag: "Digital" },
  { id: "m2-sanji", from: 396, to: 450, tag: "Physical" },
  { id: "m3-nami", from: 450, to: 505, tag: "Digital" },
  { id: "m4-mihawk", from: 505, to: 559, tag: "Physical" },
  { id: "m5-xebec", from: 559, to: 613, tag: "Digital" },
];

export type Caption = { from: number; to: number; text: string };

export const CAPTIONS: Caption[] = [
  { from: 14, to: 116, text: "Can’t read that card?" },
  { from: 128, to: 226, text: "Click the eye once." },
  { from: 232, to: 284, text: "Hover a card on stream." },
  { from: 286, to: 338, text: "See the official art." },
  { from: 341, to: 450, text: "Digital boards and real tables." },
  { from: 450, to: 610, text: "On Twitch and YouTube." },
];
