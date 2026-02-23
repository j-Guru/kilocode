#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")"

TARGET_SCRIPT="${1:-vsix}"

# Validate target
case "$TARGET_SCRIPT" in
	vsix|vsix:production|vsix:nightly) ;;
	*)
		echo "Usage: $0 [vsix|vsix:production|vsix:nightly]"
		exit 1
		;;
esac

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
	echo "❌ Error: Node.js is not installed"
	exit 1
fi

REQUIRED_NODE_VERSION="20.20.0"
CURRENT_NODE_VERSION=$(node -v | sed 's/v//')
if [ "$CURRENT_NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]; then
	echo "⚠️  Warning: Node.js version mismatch. Required: $REQUIRED_NODE_VERSION, Current: $CURRENT_NODE_VERSION"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
	echo "❌ Error: pnpm is not installed. Visit https://pnpm.io/"
	exit 1
fi

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
	echo "📥 Installing dependencies..."
	pnpm install
else
	echo "✅ Dependencies found"
fi

echo "🧹 Cleaning with standard project script..."
pnpm clean

echo "📦 Building VSIX using pnpm ${TARGET_SCRIPT}..."
pnpm "$TARGET_SCRIPT"

echo "✨ Build completed! Check the bin/ directory for the .vsix file"
