// SPDX-License-Identifier: Apache-2.0
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import { Footage } from "./components/Footage";
import { Caption } from "./components/Caption";
import { EndCard } from "./components/EndCard";
import { SHOT_META } from "./footage";
import { CAPTIONS, MONTAGE, T, TOTAL, type Shot } from "./timeline";
import { tween, ease } from "./anim";
import { C, F } from "./theme";

const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%, ${C.bgNavy} 0%, ${C.bg} 62%)` }} />
);

/** The opening take: the board, the click on the eye button, the first card on the mic drop. */
const Hero: React.FC<{ tall: boolean; W: number; H: number }> = ({ tall, W, H }) => {
  const f = useCurrentFrame();
  const id = tall ? "hero9" : "hero";
  const m = SHOT_META[id];
  const scale = W / m.w;
  const top = tall ? 330 : 0;
  // Push in on the tooltip through the hit's ring-out (its centre in crop pixels).
  const ox = (tall ? 164 : 808) * scale;
  const oy = 657 * scale + top;
  const push = tween(f, [T.ringOut, T.drop], [1, 1.14], ease.inOut);
  // A small kick on the hit itself.
  const kick = 1 + 0.018 * Math.max(0, 1 - Math.abs(f - T.reveal - 2) / 6);
  const fade = interpolate(f, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ transform: `scale(${push * kick})`, transformOrigin: `${ox}px ${oy}px` }}>
        <div style={{ position: "absolute", left: 0, top }}>
          <Footage id={id} scale={scale} pointerFrom={30} cursorSize={tall ? 1.6 : 1.5} />
          {/* Draws the eye to the in-player button in the bar before the click. */}
          {f >= T.click - 30 && f < T.click + 2 && (
            <div
              style={{
                position: "absolute",
                left: (tall ? 895 : 1539) * scale - 40,
                top: 27 * scale - 40,
                width: 80,
                height: 80,
                borderRadius: "50%",
                border: `3px solid ${C.glow}`,
                boxShadow: `0 0 26px ${C.glow}`,
                opacity: tween(f, [T.click - 30, T.click - 22], [0, 1]) * tween(f, [T.click - 2, T.click + 2], [1, 0]),
                transform: `scale(${1 + 0.12 * Math.sin(((f - T.click + 30) / 13.65) * Math.PI)})`,
              }}
            />
          )}
        </div>
        {tall && (
          <>
            <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${C.bg} 0, rgba(5,7,13,0) ${top + 60}px)` }} />
            <AbsoluteFill style={{ background: `linear-gradient(to top, ${C.bg} 0, ${C.bg} ${H - top - m.h * scale}px, rgba(5,7,13,0) ${H - top - m.h * scale + 80}px)` }} />
          </>
        )}
      </AbsoluteFill>
      {!tall && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(5,7,13,0.72) 0, rgba(5,7,13,0) 300px)" }} />}
    </AbsoluteFill>
  );
};

/** One montage hover in a dark framed window, with its source tag. */
const MontageShot: React.FC<{ shot: Shot; tall: boolean; W: number; H: number }> = ({ shot, tall, W, H }) => {
  const f = useCurrentFrame();
  const m = SHOT_META[shot.id];
  const maxW = tall ? 1000 : 1640;
  const maxH = tall ? 1120 : 800;
  const scale = Math.min(maxW / m.w, maxH / m.h, 1.6);
  const w = m.w * scale;
  const h = m.h * scale;
  const cx = W / 2;
  const cy = tall ? 860 : 482;
  const pop = tween(f, [0, 8], [0, 1]);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: cx - w / 2,
          top: cy - h / 2,
          width: w,
          height: h,
          borderRadius: 22,
          overflow: "hidden",
          border: `2px solid ${C.edge}`,
          boxShadow: `0 0 0 1px rgba(61,111,224,0.22), 0 0 70px rgba(61,111,224,0.28), 0 30px 80px -30px rgba(0,0,0,0.9)`,
          transform: `scale(${0.955 + 0.045 * pop})`,
          opacity: 0.4 + 0.6 * pop,
        }}
      >
        <Footage id={shot.id} scale={scale} cursorSize={1.45} />
      </div>
      <div
        style={{
          position: "absolute",
          left: cx - w / 2,
          top: cy - h / 2 - 50,
          fontFamily: F.display,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#b9c8f3",
          opacity: pop,
        }}
      >
        {shot.tag}
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<{ tall: boolean }> = ({ tall }) => {
  const W = tall ? 1080 : 1920;
  const H = tall ? 1920 : 1080;
  const f = useCurrentFrame();
  const outro = interpolate(f, [TOTAL - 36, TOTAL - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      <Sequence from={0} durationInFrames={T.drop}>
        <Hero tall={tall} W={W} H={H} />
      </Sequence>
      {MONTAGE.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.to - s.from}>
          <MontageShot shot={s} tall={tall} W={W} H={H} />
        </Sequence>
      ))}
      {CAPTIONS.map((c) => (
        <Sequence key={c.from} from={c.from} durationInFrames={c.to - c.from}>
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: tall ? 300 : 62 }}>
            <Caption text={c.text} duration={c.to - c.from} size={tall ? 66 : 64} />
          </AbsoluteFill>
        </Sequence>
      ))}
      <Sequence from={T.end}>
        <AbsoluteFill style={{ opacity: outro }}>
          <EndCard tall={tall} />
        </AbsoluteFill>
      </Sequence>
      <Audio src={staticFile("audio/reel.wav")} />
    </AbsoluteFill>
  );
};
