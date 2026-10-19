#!/usr/bin/env bash
# Points the README's download buttons at a release: new version in every link and file name, and the real file sizes.
# Usage: scripts/update_readme.sh v2.2.0      (needs the GitHub CLI, authenticated)
set -euo pipefail

TAG="${1:?usage: update_readme.sh vX.Y.Z}"
REPO="${GITHUB_REPOSITORY:-VirajSinghChadha/Quickpebble}"
cd "$(dirname "$0")/.."

assets="$(mktemp)"
trap 'rm -f "$assets"' EXIT
gh release view "$TAG" -R "$REPO" --json assets > "$assets"

python3 - "$TAG" "$assets" <<'PY'
import json, re, sys
tag, path = sys.argv[1:3]
ver = tag.lstrip("v")
sizes = {a["name"]: a["size"] for a in json.load(open(path))["assets"]}
s = open("README.md", encoding="utf-8").read()
s = re.sub(r"releases/download/v\d+\.\d+\.\d+/", f"releases/download/{tag}/", s)
s = re.sub(r"(Quick\.Pebble_)\d+\.\d+\.\d+(_)", lambda m: m.group(1) + ver + m.group(2), s)
s = re.sub(r"(current release, \*\*)\d+\.\d+\.\d+(\*\*)", lambda m: m.group(1) + ver + m.group(2), s)
for name, size in sizes.items():
    if not name.startswith("Quick.Pebble_") or name.endswith((".blockmap", ".yml")):
        continue
    mb = round(size / 1048576)
    # the first "N MB" after the file name on the same line
    s = re.sub(r"(" + re.escape(name) + r"[^\n]*?)\d+ MB", lambda m: f"{m.group(1)}{mb} MB", s)
open("README.md", "w", encoding="utf-8").write(s)
PY
