#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# hoverseq <name> <dwell ms> x,y x,y ... : record moving to each point and resting there;
# logs the tooltip each time to captures/<name>/hovers.jsonl.
K="$(dirname "$0")/k.sh"   # run from media/reel
name=$1; dwell=$2; shift 2
$K rec/start name=$name >/dev/null
$K wait ms=500 >/dev/null
for p in "$@"; do
  x=${p%,*}; y=${p#*,}
  $K move x=$x y=$y ms=650 >/dev/null
  $K wait ms=$dwell >/dev/null
  tt=$($K tooltip)
  echo "{\"t\":$(python3 -c 'import time;print(time.time())'),\"x\":$x,\"y\":$y,\"tooltip\":$tt}" | tee -a captures/$name/hovers.jsonl
done
$K rec/stop
