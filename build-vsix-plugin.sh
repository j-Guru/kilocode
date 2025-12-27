#!/bin/bash

echo "🚀 Building VSIX Plugin for Vertex AI Testing"
echo "=============================================="

# Ensure we are in the project root
cd "$(dirname "$0")"

# Extract version from src/package.json
VERSION=$(node -p "require('./src/package.json').version")
echo "📦 Building version: $VERSION"

# Step 1: Cleanup build environment
echo "🧹 Step 1/4: Cleaning Build Environment..."
rm -rf bin/kilo-code*.vsix
rm -rf bin-unpacked/
rm -rf src/dist/
find . -name "*.tmp" -o -name "*.log" | xargs rm -f 2>/dev/null || true
rm -rf jetbrains/plugin/build/
rm -rf jetbrains/host/dist/
find . -name ".test.js" -o -name ".spec.js" | xargs rm -f 2>/dev/null || true
rm -rf coverage/ 2>/dev/null || true
find . -name "*.vsix" -not -path "./bin/*" | xargs rm -f 2>/dev/null || true
echo "✅ Cleanup complete!"
echo ""

# Step 2: Build the VSCode extension
echo "📦 Step 2/4: Building VSCode extension..."
cd src || exit 1

# Build the extension
if ! node esbuild.mjs; then
    echo "❌ Error: VSCode extension build failed"
    exit 1
fi

# Create VSIX package
if ! pnpm vsix; then
    echo "❌ Error: VSIX packaging failed"
    exit 1
fi

# Create unpacked extension
if ! pnpm vsix:unpacked; then
    echo "❌ Error: Unpacked extension creation failed"
    exit 1
fi

cd ..

# Step 3: Verify build artifacts
echo "✅ Step 3/4: Verifying build artifacts..."

if [ ! -f "bin/kilo-code-$VERSION.vsix" ]; then
    echo "❌ Error: VSIX package not found"
    exit 1
fi

if [ ! -d "bin-unpacked/extension" ]; then
    echo "❌ Error: Unpacked extension not found"
    exit 1
fi

# Step 4: Display results
VSIX_SIZE=$(du -h "bin/kilo-code-$VERSION.vsix" | awk '{print $1}')
UNPACKED_SIZE=$(du -sh "bin-unpacked/extension/" | awk '{print $1}')

echo "✅ Step 4/4: Build complete!"
echo ""
echo "📍 Build Artifacts:"
echo "   VSIX Package: ./bin/kilo-code-$VERSION.vsix ($VSIX_SIZE)"
echo "   Unpacked Extension: ./bin-unpacked/extension/ ($UNPACKED_SIZE)"
echo ""
echo "🎯 Vertex AI Fixes Included:"
echo "   ✅ URL construction fixes"
echo "   ✅ Error handling improvements"
echo "   ✅ Path normalization for Windows"
echo "   ✅ Authentication fixes"
echo "   ✅ UI enhancements"
echo ""
echo "🚀 Ready for testing!"
echo "   Install: code --install-extension kilo-code-$VERSION.vsix"
echo ""
