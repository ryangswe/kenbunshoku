// SPDX-License-Identifier: Apache-2.0
// The reel's music: three sections of the track (README.md, "Music"), cut on its bar lines
// (~131.9 BPM, one bar = 1.8195 s), joined with short equal-power crossfades placed just before
// each bar's onset, loudness-normalised to -14 LUFS (two-pass loudnorm), ending on the track's own
// final hit and decay with a fade.
//
// Cut list (source seconds -> reel seconds); STORYBOARD.md has the same table:
//   A  src  0.000 –  4.040  ->  reel  0.000 –  4.040   opening (bars 1–2 of the first intro phrase)
//   B  src 11.318 – 25.870  ->  reel  4.040 – 18.592   bars 3–4 of the second intro phrase, the
//                                                      "mic drop" hit (src 15.02 -> reel 7.74),
//                                                      its 2-bar ring-out, the drop (src 18.63 ->
//                                                      reel 11.35), 4 bars of the main section
//   C  src 89.533 – 97.474  ->  reel 18.592 – 26.533   the last bar of the second main section,
//                                                      the final hit (src 91.34 -> reel 20.40), decay
//   fade out reel 24.8 – 26.533 (frame-aligned end: 796 frames at 30 fps)
// Crossfades: 30 ms, centred on each splice.
//
//   node scripts/make-audio.mjs   ->  public/audio/reel.wav

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const SRC = "public/audio/tatamusic-sports-sports-music-569203.mp3";
const OUT = "public/audio/reel.wav";
export const CUTS = [
  { name: "A", from: 0.0, to: 4.04 },
  { name: "B", from: 11.318, to: 25.87 },
  { name: "C", from: 89.533, to: 97.474 },
];
const XF = 0.03;
const TOTAL = 796 / 30;
const FADE_START = 24.8;

mkdirSync("public/audio", { recursive: true });

// Each section is trimmed with XF/2 of extra audio on each inner side, so the crossfade is centred
// on the splice and the reel timeline stays exactly as in the table above.
const parts = CUTS.map((c, i) => {
  const a = i === 0 ? c.from : c.from - XF / 2;
  const b = i === CUTS.length - 1 ? c.to : c.to + XF / 2;
  return `[0:a]atrim=start=${a.toFixed(4)}:end=${b.toFixed(4)},asetpts=PTS-STARTPTS[s${i}]`;
});
const chain = `[s0][s1]acrossfade=d=${XF}:c1=qsin:c2=qsin[x1];[x1][s2]acrossfade=d=${XF}:c1=qsin:c2=qsin[x2]`;
const tail = `[x2]atrim=end=${TOTAL.toFixed(4)},afade=t=out:st=${FADE_START}:d=${(TOTAL - FADE_START).toFixed(4)},aresample=48000`;

function run(extra, out) {
  return execFileSync("ffmpeg", ["-v", "info", "-y", "-i", SRC, "-filter_complex", `${parts.join(";")};${chain};${tail}${extra}[o]`, "-map", "[o]", ...out], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Pass 1: measure (ffmpeg prints loudnorm's JSON on stderr).
const r = execFileSync("bash", ["-c", `ffmpeg -hide_banner -y -i "${SRC}" -filter_complex "${parts.join(";")};${chain};${tail},loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[o]" -map "[o]" -f null - 2>&1`], { encoding: "utf8" });
const stats = JSON.parse(r.match(/\{[\s\S]*?\}/g).pop());
const ln = `,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true,aresample=48000`;
run(ln, ["-c:a", "pcm_s16le", OUT]);
console.log(`wrote ${OUT}: ${TOTAL.toFixed(3)} s; measured ${stats.input_i} LUFS -> -14`);
