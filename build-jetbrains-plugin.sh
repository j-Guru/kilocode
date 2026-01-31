#!/bin/bash

set -euo pipefail

MIN_SIZE_MB=300
MAX_SIZE_MB=400
ARTIFACT_DIR="jetbrains/plugin/build/distributions"
ARTIFACT_NAME_PATTERN="Kilo Code-*.zip"

cd "$(dirname "$0")"

TARGET_SCRIPT="${1:-jetbrains:bundle}"

case "$TARGET_SCRIPT" in
	jetbrains:bundle|jetbrains:build|jetbrains:run-bundle|jetbrains:run) ;;
	*)
		echo "Usage: $0 [jetbrains:bundle|jetbrains:build|jetbrains:run-bundle|jetbrains:run]"
		exit 1
		;;
esac

echo "📦 Stopping any existing Gradle daemons..."
(cd jetbrains/plugin && ./gradlew --stop)

echo "📦 Generating platform files..."
(cd jetbrains/plugin && ./gradlew genPlatform --info --stacktrace)

echo "🛠️  Building with pnpm ${TARGET_SCRIPT}..."
GRADLE_OPTS="-Dorg.gradle.daemon=true -Dorg.gradle.parallel=true -Dorg.gradle.caching=true -Dkotlin.compiler.execution.strategy=in-process" pnpm "$TARGET_SCRIPT"

FOUND_ARTIFACT=$(find "$ARTIFACT_DIR" -maxdepth 1 -name "$ARTIFACT_NAME_PATTERN" | head -n 1)

if [ ! -f "$FOUND_ARTIFACT" ]; then
	echo "❌ Error: Build artifact not found in $ARTIFACT_DIR with pattern $ARTIFACT_NAME_PATTERN"
	exit 1
fi

ARTIFACT_FILENAME=$(basename "$FOUND_ARTIFACT")
EXTRACTED_VERSION=$(echo "$ARTIFACT_FILENAME" | sed -E 's/Kilo Code-(.*)\.zip/\1/')
FILE_SIZE_BYTES=$(stat -c%s "$FOUND_ARTIFACT")
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
