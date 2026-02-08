#!/bin/bash

# copy-build-to-desktop.sh
# Script to copy build artifacts to Windows Desktop
# Copies VSCode VSIX and JetBrains plugin to C:\Users\admin\Desktop

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Find the latest build artifacts dynamically
print_step "Detecting build artifacts..."

# Find the most recent VSIX file
VSIX_SOURCE=$(find bin -maxdepth 1 -name "kilo-code-*.vsix" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -z "$VSIX_SOURCE" ]; then
    print_error "No VSCode VSIX found in bin/ directory"
    print_warning "Run ./build-vsix-plugin.sh first to build the VSCode extension"
    exit 1
fi

# Find the most recent JetBrains plugin ZIP file
JETBRAINS_SOURCE=$(find jetbrains/plugin/build/distributions -maxdepth 1 -name "Kilo Code-*.zip" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -z "$JETBRAINS_SOURCE" ]; then
    print_error "No JetBrains plugin found in jetbrains/plugin/build/distributions/ directory"
    print_warning "Run ./build-jetbrains-plugin.sh release first to build the JetBrains plugin"
    exit 1
fi

# Extract filenames for destination
VSIX_FILENAME=$(basename "$VSIX_SOURCE")
JETBRAINS_FILENAME=$(basename "$JETBRAINS_SOURCE")

# Extract version numbers
VSIX_VERSION=$(echo "$VSIX_FILENAME" | grep -oP 'kilo-code-\K[0-9]+\.[0-9]+\.[0-9]+')
JETBRAINS_VERSION=$(echo "$JETBRAINS_FILENAME" | grep -oP 'Kilo Code-\K[0-9]+\.[0-9]+\.[0-9]+')

# Define Windows Desktop path (works in WSL, Git Bash, and Cygwin)
if [[ -n "$WSLENV" ]]; then
    # Running in WSL
    DESKTOP_PATH="/mnt/c/Users/admin/Desktop"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Running in Git Bash or Cygwin
    DESKTOP_PATH="/c/Users/admin/Desktop"
else
    # Try common path
    DESKTOP_PATH="/mnt/c/Users/admin/Desktop"
fi

print_info "Build Artifact Copy Script"
print_info "=========================="
echo ""

# Display detected files with versions
print_info "✓ Found VSCode VSIX: $VSIX_SOURCE (v$VSIX_VERSION)"
print_info "✓ Found JetBrains plugin: $JETBRAINS_SOURCE (v$JETBRAINS_VERSION)"

# Check if versions match
if [ "$VSIX_VERSION" != "$JETBRAINS_VERSION" ]; then
    print_warning "Version mismatch detected!"
    print_warning "  VSCode: v$VSIX_VERSION"
    print_warning "  JetBrains: v$JETBRAINS_VERSION"
else
    print_info "✓ Both plugins are at version $VSIX_VERSION"
fi

echo ""

# Check if destination directory exists
print_step "Checking destination directory..."

if [ ! -d "$DESKTOP_PATH" ]; then
    print_error "Desktop directory not found: $DESKTOP_PATH"
    print_warning "Please verify the Windows Desktop path exists"
    print_warning "Current OS type: $OSTYPE"
    exit 1
fi
print_info "✓ Desktop directory exists: $DESKTOP_PATH"

echo ""

# Get file sizes
VSIX_SIZE=$(du -h "$VSIX_SOURCE" | cut -f1)
JETBRAINS_SIZE=$(du -h "$JETBRAINS_SOURCE" | cut -f1)

print_info "File sizes:"
print_info "  - VSCode VSIX: $VSIX_SIZE"
print_info "  - JetBrains Plugin: $JETBRAINS_SIZE"

echo ""

# Copy files
print_step "Copying files to Desktop..."

# Copy VSCode VSIX
print_info "Copying VSCode extension..."
if cp "$VSIX_SOURCE" "$DESKTOP_PATH/"; then
    print_info "✓ VSCode VSIX copied successfully"
else
    print_error "Failed to copy VSCode VSIX"
    exit 1
fi

# Copy JetBrains plugin
print_info "Copying JetBrains plugin..."
if cp "$JETBRAINS_SOURCE" "$DESKTOP_PATH/"; then
    print_info "✓ JetBrains plugin copied successfully"
else
    print_error "Failed to copy JetBrains plugin"
    exit 1
fi

echo ""

# Verify copied files
print_step "Verifying copied files..."

VSIX_DEST="$DESKTOP_PATH/$VSIX_FILENAME"
JETBRAINS_DEST="$DESKTOP_PATH/$JETBRAINS_FILENAME"

if [ -f "$VSIX_DEST" ]; then
    VSIX_DEST_SIZE=$(du -h "$VSIX_DEST" | cut -f1)
    print_info "✓ VSCode VSIX verified ($VSIX_DEST_SIZE)"
else
    print_error "VSCode VSIX not found at destination"
    exit 1
fi

if [ -f "$JETBRAINS_DEST" ]; then
    JETBRAINS_DEST_SIZE=$(du -h "$JETBRAINS_DEST" | cut -f1)
    print_info "✓ JetBrains plugin verified ($JETBRAINS_DEST_SIZE)"
else
    print_error "JetBrains plugin not found at destination"
    exit 1
fi

echo ""
print_info "=========================="
print_info "✨ Copy completed successfully!"
print_info "=========================="
echo ""
print_info "Files copied to: $DESKTOP_PATH"
echo ""
print_info "Installation instructions:"
echo ""
print_info "VSCode Extension:"
print_info "  1. Open VSCode"
print_info "  2. Press Ctrl+Shift+P"
print_info "  3. Type 'Extensions: Install from VSIX'"
print_info "  4. Select $VSIX_FILENAME from Desktop"
echo ""
print_info "JetBrains Plugin:"
print_info "  1. Open IntelliJ IDEA / WebStorm / PyCharm"
print_info "  2. Go to Settings → Plugins"
print_info "  3. Click gear icon → Install Plugin from Disk"
print_info "  4. Select '$JETBRAINS_FILENAME' from Desktop"
echo ""
