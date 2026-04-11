#!/bin/bash
set -euo pipefail
shopt -s nullglob

root="$(cd "$(dirname "$0")" && pwd)"

dirs=(
  "$root/packages/kilo-vscode/bin"
  "$root/packages/kilo-vscode/dist"
  "$root/packages/kilo-vscode/out"
  "$root/packages/opencode/dist"
  "$root/packages/sdk/js/dist"
)

globs=(
  "$root/packages/kilo-vscode"/*.vsix
)

for path in "${dirs[@]}"; do
  rm -rf "$path"
  echo "OK  removed $path"
done

for path in "${globs[@]}"; do
  rm -f "$path"
  echo "OK  removed $path"
done

echo "OK  project cleaned"
