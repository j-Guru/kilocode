#!/bin/bash
#
# build-jetbrains-plugin.sh
#
# Official build script for Kilo Code JetBrains plugin
#
# This script builds the JetBrains plugin using the official Kilo Code build
# system (pnpm + Turbo). It ensures all dependencies are properly built and
# bundled, including:
#   - VSCode webview UI (React components, settings, etc.)
#   - VSCode extension (core logic, API providers, tools)
#   - JetBrains host (Node.js runtime for extension)
#   - JetBrains plugin (Kotlin/Java IntelliJ plugin)
#
# Usage:
#   ./build-jetbrains-plugin.sh           # Normal build (uses Turbo cache)
#   ./build-jetbrains-plugin.sh --clean   # Clean build (rebuilds everything)
#   ./build-jetbrains-plugin.sh --help    # Show help
#
# Prerequisites:
#   - Node.js 20.20.0
#   - pnpm (package manager)
#   - Java 21 (for Gradle build)
#   - All project dependencies installed (pnpm install)
#
# Output:
#   jetbrains/plugin/build/distributions/Kilo Code-<version>.zip
#
# Expected size: 300-400MB (includes VSCode extension host and dependencies)
#
# Note: This script uses 'pnpm jetbrains:bundle' which automatically:
#   - Builds the webview with all UI components (including LenientXmlParsingControl)
#   - Packages the VSCode extension
#   - Copies resources to JetBrains plugin directories
#   - Runs Gradle buildPlugin with proper dependencies
#

set -euo pipefail

# Configuration
MIN_SIZE_MB=300
MAX_SIZE_MB=400
ARTIFACT_DIR="jetbrains/plugin/build/distributions"
ARTIFACT_NAME_PATTERN="Kilo Code-*.zip"

cd "$(dirname "$0")"

# Parse arguments
CLEAN_BUILD=false
BUILD_MODE="${1:-}"

# Show usage
show_usage() {
	echo "Usage: $0 [--clean]"
	echo ""
	echo "Builds the JetBrains plugin using the official Kilo Code build system."
	echo ""
	echo "Options:"
	echo "  --clean    Clean all build artifacts before building"
	echo ""
	echo "Examples:"
	echo "  $0           # Normal build (uses Turbo cache)"
	echo "  $0 --clean   # Clean build (rebuilds everything)"
	exit 1
}

# Parse options
if [ -n "$BUILD_MODE" ]; then
	case "$BUILD_MODE" in
		--clean)
			CLEAN_BUILD=true
			;;
		--help|-h)
			show_usage
			;;
		*)
			echo "❌ Error: Unknown option '$BUILD_MODE'"
			echo ""
			show_usage
			;;
	esac
fi

echo "🔍 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
	echo "❌ Error: Node.js is not installed"
	echo "   Please install Node.js 20.x from https://nodejs.org/"
	exit 1
fi

REQUIRED_NODE_VERSION="20.20.0"
CURRENT_NODE_VERSION=$(node -v | sed 's/v//')
if [ "$CURRENT_NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]; then
	echo "⚠️  Warning: Node.js version mismatch"
	echo "   Required: $REQUIRED_NODE_VERSION"
	echo "   Current:  $CURRENT_NODE_VERSION"
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
	echo "❌ Error: pnpm is not installed"
	echo "   Install with: npm install -g pnpm"
	exit 1
fi

# Check Java
if ! command -v java &> /dev/null; then
	echo "❌ Error: Java is not installed"
	echo "   Please install Java 21 (required for JetBrains plugin build)"
	exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" != "21" ]; then
	echo "⚠️  Warning: Java version mismatch"
	echo "   Required: Java 21"
	echo "   Current:  Java $JAVA_VERSION"
	echo "   The build may fail. Consider using SDKMAN to install Java 21:"
	echo "   sdk install java 21.0.5-tem && sdk use java 21.0.5-tem"
fi

echo "✅ Prerequisites check passed"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
	echo "📥 Installing dependencies..."
	pnpm install
else
	echo "✅ Dependencies found"
fi

# Clean build if requested
if [ "$CLEAN_BUILD" = true ]; then
	echo "🧹 Cleaning all build artifacts..."
	pnpm clean
fi

# Stop any existing Gradle daemons
echo "📦 Stopping any existing Gradle daemons..."
(cd jetbrains/plugin && ./gradlew --stop) || true

# Build using official Kilo Code method
echo "🛠️  Building JetBrains plugin using pnpm jetbrains:bundle..."
echo "   This will:"
echo "   - Build VSCode webview UI"
echo "   - Build VSCode extension"
echo "   - Copy resources to JetBrains plugin"
echo "   - Build JetBrains plugin with Gradle"
echo ""

pnpm jetbrains:bundle

# Verify artifact was created
echo ""
echo "🔍 Verifying build artifact..."

FOUND_ARTIFACT=$(
	find "$ARTIFACT_DIR" -maxdepth 1 -name "$ARTIFACT_NAME_PATTERN" -type f -printf "%T@ %p\n" 2>/dev/null \
		| sort -nr \
		| head -n 1 \
		| cut -d' ' -f2-
)

if [ -z "$FOUND_ARTIFACT" ] || [ ! -f "$FOUND_ARTIFACT" ]; then
	echo "❌ Error: Build artifact not found in $ARTIFACT_DIR"
	echo "   Expected pattern: $ARTIFACT_NAME_PATTERN"
	exit 1
fi

# Extract version and check size
ARTIFACT_FILENAME=$(basename "$FOUND_ARTIFACT")
EXTRACTED_VERSION=$(echo "$ARTIFACT_FILENAME" | sed -E 's/Kilo Code-(.*)\.zip/\1/')

# Get file size (cross-platform)
if stat -c%s "$FOUND_ARTIFACT" >/dev/null 2>&1; then
	# Linux
	FILE_SIZE_BYTES=$(stat -c%s "$FOUND_ARTIFACT")
else
	# macOS/BSD
	FILE_SIZE_BYTES=$(stat -f%z "$FOUND_ARTIFACT")
fi
FILE_SIZE_MB=$((FILE_SIZE_BYTES / 1024 / 1024))

# Report results
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Build Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Version:  $EXTRACTED_VERSION"
echo "   Size:     ${FILE_SIZE_MB}MB"
echo "   Location: $FOUND_ARTIFACT"
echo ""

# Validate size
if [ "$FILE_SIZE_MB" -lt "$MIN_SIZE_MB" ]; then
	echo "⚠️  WARNING: Build size (${FILE_SIZE_MB}MB) is smaller than expected (${MIN_SIZE_MB}MB minimum)"
	echo "   This might indicate:"
	echo "   - Missing VSCode extension/webview"
	echo "   - Missing JetBrains host dependencies"
	echo "   - Incomplete build"
	echo ""
	echo "   Try running with --clean flag:"
	echo "   $0 --clean"
	echo ""
	exit 1
elif [ "$FILE_SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
	echo "⚠️  WARNING: Build size (${FILE_SIZE_MB}MB) is larger than expected (${MAX_SIZE_MB}MB maximum)"
	echo "   This might indicate unexpected bloat."
	echo ""
else
	echo "✅ Build size is within the healthy range (${MIN_SIZE_MB}-${MAX_SIZE_MB}MB)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ JetBrains plugin built successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
