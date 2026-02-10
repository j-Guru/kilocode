#!/bin/bash

set -euo pipefail

MIN_SIZE_MB=300
MAX_SIZE_MB=400
ARTIFACT_DIR="jetbrains/plugin/build/distributions"
ARTIFACT_NAME_PATTERN="Kilo Code-*.zip"

cd "$(dirname "$0")"

BUILD_MODE="${1:-release}"

case "$BUILD_MODE" in
	release|idea|none) ;;
	*)
		echo "Usage: $0 [release|idea|none]"
		echo ""
		echo "Build modes:"
		echo "  release - Production build (default)"
		echo "  idea    - Development build with hot-reloading"
		echo "  none    - Lightweight build for testing"
		exit 1
		;;
esac

echo "📦 Stopping any existing Gradle daemons..."
(cd jetbrains/plugin && ./gradlew --stop)

if [ "$BUILD_MODE" = "release" ]; then
	echo "📦 Generating platform files (release mode)..."
	(cd jetbrains/plugin && ./gradlew genPlatform)
else
	echo "📦 Skipping platform generation for mode: ${BUILD_MODE}"
fi

mkdir -p "$ARTIFACT_DIR"
echo "🧹 Removing previous build artifacts matching ${ARTIFACT_NAME_PATTERN}..."
find "$ARTIFACT_DIR" -maxdepth 1 -name "$ARTIFACT_NAME_PATTERN" -type f -delete

echo "🛠️  Building plugin with Gradle (mode: ${BUILD_MODE})..."
(cd jetbrains/plugin && ./gradlew buildPlugin -PdebugMode="${BUILD_MODE}")

FOUND_ARTIFACT=$(
	find "$ARTIFACT_DIR" -maxdepth 1 -name "$ARTIFACT_NAME_PATTERN" -type f -printf "%T@ %p\n" \
		| sort -nr \
		| head -n 1 \
		| cut -d' ' -f2-
)

if [ ! -f "$FOUND_ARTIFACT" ]; then
	echo "❌ Error: Build artifact not found in $ARTIFACT_DIR with pattern $ARTIFACT_NAME_PATTERN"
	exit 1
fi

ARTIFACT_FILENAME=$(basename "$FOUND_ARTIFACT")
EXTRACTED_VERSION=$(echo "$ARTIFACT_FILENAME" | sed -E 's/Kilo Code-(.*)\.zip/\1/')
if stat -c%s "$FOUND_ARTIFACT" >/dev/null 2>&1; then
	FILE_SIZE_BYTES=$(stat -c%s "$FOUND_ARTIFACT")
else
	FILE_SIZE_BYTES=$(stat -f%z "$FOUND_ARTIFACT")
fi
FILE_SIZE_MB=$((FILE_SIZE_BYTES / 1024 / 1024))

echo "📊 Build complete. Final size: ${FILE_SIZE_MB}MB"

if [ "$FILE_SIZE_MB" -lt "$MIN_SIZE_MB" ] || [ "$FILE_SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
	echo "⚠️  WARNING: Build size (${FILE_SIZE_MB}MB) is outside the expected range (${MIN_SIZE_MB}-${MAX_SIZE_MB}MB)!"
	echo "   Small size might indicate missing dependencies or VSCode host."
	echo "   Large size might indicate unexpected bloat."
else
	echo "✅ Build size is within the healthy range."
fi

echo "📍 Artifact location: $FOUND_ARTIFACT"
echo "✅ Plugin - version ${EXTRACTED_VERSION} is built successfully!"
