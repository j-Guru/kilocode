#!/bin/bash

# Configuration
MIN_SIZE_MB=300
MAX_SIZE_MB=400
ARTIFACT_DIR="jetbrains/plugin/build/distributions"
ARTIFACT_NAME_PATTERN="Kilo Code-*.zip"

echo "🚀 Starting JetBrains Plugin Production Build..."

# Ensure we are in the project root
cd "$(dirname "$0")"

# 1. Rebuild VSCode Extension (Critical for code changes)
echo "📦 Rebuilding VSCode extension..."
# Build the JS/TS code
pnpm --filter kilo-code bundle
if [ $? -ne 0 ]; then
    echo "❌ Error: VSCode extension bundle failed"
    exit 1
fi
# Package into VSIX
pnpm --filter kilo-code vsix
if [ $? -ne 0 ]; then
    echo "❌ Error: VSCode extension packaging failed"
    exit 1
fi
# Unpack for JetBrains plugin to consume
pnpm --filter kilo-code vsix:unpacked
if [ $? -ne 0 ]; then
    echo "❌ Error: VSCode extension unpack failed"
    exit 1
fi

# 2. Generate Platform files (required for production bundle)
echo "📦 Generating platform files..."
cd jetbrains/plugin
./gradlew genPlatform
if [ $? -ne 0 ]; then
    echo "❌ Error: genPlatform failed"
    exit 1
fi
cd ../..

# 3. Run the full Turbo bundle command
echo "🛠️  Building production bundle (Plug and Pray mode)..."
pnpm jetbrains:bundle
if [ $? -ne 0 ]; then
    echo "❌ Error: pnpm jetbrains:bundle failed"
    exit 1
fi

# 4. Size Validation and version extraction
FOUND_ARTIFACT=$(find "$ARTIFACT_DIR" -maxdepth 1 -name "$ARTIFACT_NAME_PATTERN" | head -n 1)

if [ -f "$FOUND_ARTIFACT" ]; then
    # Extract version from the found artifact name
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
else
    echo "❌ Error: Build artifact not found in $ARTIFACT_DIR with pattern $ARTIFACT_NAME_PATTERN"
    exit 1
fi

echo "🙏 Praying for a successful installation..."
