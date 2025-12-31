#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")"

TARGET_SCRIPT="${1:-vsix}"

case "$TARGET_SCRIPT" in
	vsix|vsix:production|vsix:nightly) ;;
	*)
		echo "Usage: $0 [vsix|vsix:production|vsix:nightly]"
		exit 1
		;;
esac

echo "🧹 Cleaning with standard project script..."
pnpm clean

echo "📦 Building VSIX using pnpm ${TARGET_SCRIPT}..."
pnpm "$TARGET_SCRIPT"
