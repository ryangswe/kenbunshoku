// SPDX-License-Identifier: Apache-2.0
import { Composition } from "remotion";
import { Reel } from "./Reel";
import { StoreShot } from "./StoreShot";
import { FPS, TOTAL } from "./timeline";

export const Root: React.FC = () => (
  <>
    <Composition id="Reel" component={Reel} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ tall: false }} />
    <Composition id="Cutdown" component={Reel} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={{ tall: true }} />
    <Composition id="Store" component={StoreShot} durationInFrames={30} fps={FPS} width={1280} height={800} />
  </>
);
