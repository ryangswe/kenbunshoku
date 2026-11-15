<!-- SPDX-License-Identifier: Apache-2.0 -->

When card recognition finishes loading while the pointer rests on a card in the video, Kenbunshoku now names that card in two cases where it could miss it: when its hidden frame in the page connects more than 10 seconds after the pointer last moved, as in a new tab whose model loads slowly, and when loading ends just before those 10 seconds are over. As before, it reads at most one picture for that resting pointer, within 60 seconds of the pointer's last move.
