#!/bin/bash

# Configuration
MIN_SIZE_MB=300
MAX_SIZE_MB=400
PLUGIN_VERSION=$(grep 'pluginVersion=' jetbrains/plugin/gradle.properties | cut -d'=' -f2)
BUILD_PATH="jetbrains/plugin/build/distributions/Kilo Code-${PLUGIN_VERSION}.zip"

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

# 4. Size Validation
if [ -f "$BUILD_PATH" ]; then
    FILE_SIZE_BYTES=$(stat -c%s "$BUILD_PATH")
    FILE_SIZE_MB=$((FILE_SIZE_BYTES / 1024 / 1024))

    echo "📊 Build complete. Final size: ${FILE_SIZE_MB}MB"

    if [ "$FILE_SIZE_MB" -lt "$MIN_SIZE_MB" ] || [ "$FILE_SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
        echo "⚠️  WARNING: Build size (${FILE_SIZE_MB}MB) is outside the expected range (${MIN_SIZE_MB}-${MAX_SIZE_MB}MB)!"
        echo "   Small size might indicate missing dependencies or VSCode host."
        echo "   Large size might indicate unexpected bloat."
    else
        echo "✅ Build size is within the healthy range."
    fi

    echo "📍 Artifact location: $BUILD_PATH"
else
    echo "❌ Error: Build artifact not found at $BUILD_PATH"
    exit 1
fi

echo "🙏 Praying for a successful installation..."
