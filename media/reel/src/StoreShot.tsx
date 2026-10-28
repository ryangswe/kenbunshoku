// SPDX-License-Identifier: Apache-2.0
import { AbsoluteFill } from "remotion";
import { Footage } from "./components/Footage";

/** A 1280x800 store screenshot: one hover on the physical table, the mat only, scaled to fill, cursor only. */
export const StoreShot: React.FC = () => (
  <AbsoluteFill>
    <Footage id="store-ace" scale={1280 / 1196} cursorSize={1.4} />
  </AbsoluteFill>
);
