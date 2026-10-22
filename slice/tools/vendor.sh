#!/usr/bin/env bash
# Copies runtime libraries from tools/node_modules into slice/vendor (committed, no CDN, no build step).
# Usage: (cd slice/tools && npm install && ./vendor.sh)
set -euo pipefail
cd "$(dirname "$0")"
V=../vendor
rm -rf "$V"; mkdir -p "$V/three/build" "$V/three/examples/jsm" "$V/postprocessing" "$V/n8ao"
cp node_modules/three/build/three.module.js node_modules/three/build/three.core.js "$V/three/build/"
cp node_modules/three/LICENSE "$V/three/LICENSE"
# addons: everything except heavy/unneeded folders
for d in node_modules/three/examples/jsm/*; do
  b=$(basename "$d")
  case "$b" in libs|loaders|exporters|transpiler|inspector|physics|webxr|renderers|tsl|offscreen|gpgpu|animation|capabilities|interactive|controls) continue;; esac
  cp -r "$d" "$V/three/examples/jsm/"
done
# a few single addons from skipped folders that are handy
mkdir -p "$V/three/examples/jsm/controls"
cp node_modules/three/examples/jsm/controls/OrbitControls.js "$V/three/examples/jsm/controls/"
cp node_modules/postprocessing/build/index.js "$V/postprocessing/postprocessing.js"
cp node_modules/postprocessing/LICENSE.md "$V/postprocessing/LICENSE.md"
cp node_modules/n8ao/dist/N8AO.js "$V/n8ao/N8AO.js"
cp node_modules/n8ao/LICENSE "$V/n8ao/LICENSE"
cat > "$V/README.md" <<'MD'
# Vendored runtime libraries (no build step, no CDN)

| Library | Version | License | Files |
| --- | --- | --- | --- |
| three.js | 0.186.1 | MIT | `three/build/*`, selected `three/examples/jsm/*` addons |
| postprocessing (pmndrs) | 6.39.5 | Zlib | `postprocessing/postprocessing.js` |
| N8AO | 2.0.1 | ISC | `n8ao/N8AO.js` |

Regenerate with `cd slice/tools && npm install && ./vendor.sh`.
MD
du -sh "$V"
