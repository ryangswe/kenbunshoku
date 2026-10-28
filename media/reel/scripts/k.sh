#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# k <route> [key=value ...] : call the capture driver with URL-encoded params.
route=$1; shift
args=()
for kv in "$@"; do args+=(--data-urlencode "$kv"); done
curl -s -G "localhost:8791/$route" "${args[@]}"
