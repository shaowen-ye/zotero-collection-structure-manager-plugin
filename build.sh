#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export ROOT_DIR
DIST_DIR="$ROOT_DIR/dist"
PLUGIN_NAME="zotero-collection-structure-manager-plugin"
VERSION="$(python3 - <<'PY'
import json
import os
from pathlib import Path

manifest = json.loads(Path(os.environ["ROOT_DIR"]).joinpath("manifest.json").read_text())
print(manifest["version"])
PY
)"
XPI_PATH="$DIST_DIR/${PLUGIN_NAME}-${VERSION}.xpi"

mkdir -p "$DIST_DIR"
rm -f "$XPI_PATH"

cd "$ROOT_DIR"
zip -r "$XPI_PATH" \
  manifest.json \
  icons \
  bootstrap.js \
  collection-structure-manager-plugin.js \
  README.md

echo "$XPI_PATH"
