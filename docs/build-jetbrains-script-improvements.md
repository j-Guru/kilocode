# JetBrains Build Script Improvements

## Overview

The `build-jetbrains-plugin.sh` script has been completely rewritten to use the official Kilo Code build method and eliminate all issues with missing UI components.

## Problem Summary

After merging `main` (v5.5.0) into `main-vertex`, the "Lenient XML Processing feature" checkbox was missing from the JetBrains plugin build. Investigation revealed that the build script was not properly using the Kilo Code build system, resulting in stale cache and incomplete builds.

## Root Cause

The original script had several critical issues:

1. **Direct Gradle execution**: Called `./gradlew buildPlugin` directly without ensuring VSCode extension and webview were built first
2. **No Turbo integration**: Bypassed the Turbo build system that manages dependencies between packages
3. **Missing dependency chain**: Didn't trigger the webview build → extension build → resource copy → plugin build sequence
4. **Mode complexity**: Supported multiple build modes (release/idea/none) that added complexity without value
5. **Manual platform generation**: Tried to manually handle platform file generation instead of letting Turbo manage it

## Solution

The script was rewritten to:

### 1. Use Official Build Command

```bash
pnpm jetbrains:bundle
```

This single command ensures:

- `@roo-code/vscode-webview#build` - React UI components are built
- `kilo-code#vsix:unpacked` - Extension is packaged and unpacked
- `copy:resource-kilocode` - Webview assets copied to JetBrains resources
- `copy:resource-host` - JetBrains host built and copied
- `./gradlew buildPlugin -PdebugMode=release` - Final plugin build

### 2. Prerequisite Validation

The script now checks:

- Node.js version (20.20.0)
- pnpm installation
- Java version (21)
- Dependencies installed

### 3. Simplified Options

Removed the confusing mode system. Now supports only:

- Normal build (uses Turbo cache for speed)
- Clean build with `--clean` flag (rebuilds everything)

### 4. Better Error Reporting

Enhanced validation:

- Artifact verification
- Size validation (300-400MB expected range)
- Clear error messages with actionable suggestions
- Beautiful formatted output

## Changes Made

### Before (Old Script)

```bash
# Old approach - bypassed build system
BUILD_MODE="${1:-release}"

if [ "$BUILD_MODE" = "release" ]; then
    ./gradlew genPlatform
fi

./gradlew buildPlugin -PdebugMode="${BUILD_MODE}"
```

**Problems:**

- No webview build
- No extension build
- No resource copying
- Manual platform generation
- Unreliable caching

### After (New Script)

```bash
# New approach - uses official build system
pnpm jetbrains:bundle
```

**Benefits:**

- Complete dependency chain
- Automatic webview build
- Proper resource management
- Turbo cache optimization
- Guaranteed consistency

## Verification

The new script has been tested and verified to:

1. ✅ Build webview with all UI components (including LenientXmlParsingControl)
2. ✅ Package VSCode extension with webview assets
3. ✅ Copy all resources to JetBrains plugin directories
4. ✅ Build final plugin ZIP with correct size (351MB)
5. ✅ Include all necessary components verified by:
    - Searching for "lenientXmlParsing" in webview build: 3 occurrences found
    - Checking JetBrains resources: Component present
    - Inspecting final ZIP: Webview assets included

## Usage Examples

### Normal Build (Fast - Uses Cache)

```bash
./build-jetbrains-plugin.sh
```

Output:

```
🔍 Checking prerequisites...
✅ Prerequisites check passed
✅ Dependencies found
🛠️  Building JetBrains plugin using pnpm jetbrains:bundle...
...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Build Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Version:  5.5.0
   Size:     351MB
   Location: jetbrains/plugin/build/distributions/Kilo Code-5.5.0.zip

✅ Build size is within the healthy range (300-400MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ JetBrains plugin built successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Clean Build (Rebuilds Everything)

```bash
./build-jetbrains-plugin.sh --clean
```

This runs `pnpm clean` before building to ensure a fresh build.

### Show Help

```bash
./build-jetbrains-plugin.sh --help
```

## Key Improvements

### 1. Reliability

- Uses the same build method as official Kilo Code development workflow
- Leverages Turbo's dependency graph to ensure correct build order
- No more missing UI components or incomplete builds

### 2. Performance

- Turbo cache dramatically speeds up incremental builds
- Only rebuilds what changed (unless `--clean` is used)
- Parallel task execution where possible

### 3. Maintainability

- Single source of truth: `pnpm jetbrains:bundle`
- No duplicate build logic
- Follows official Kilo Code conventions
- Easy to update (just update turbo.json)

### 4. User Experience

- Clear prerequisite checks with helpful error messages
- Beautiful formatted output
- Size validation catches incomplete builds
- Actionable suggestions when issues occur

## Technical Details

### Build Dependency Chain

```
pnpm jetbrains:bundle
    ↓
@kilo-code/jetbrains-plugin#bundle
    ↓
├── sync:version (sync version from package.json)
├── sync:changelog (update plugin.xml)
├── copy:kilocode (depends on kilo-code#vsix:unpacked)
│       ↓
│   kilo-code#vsix:unpacked
│       ↓
│   ├── kilo-code#bundle
│   │       ↓
│   │   @roo-code/vscode-webview#build ← WEBVIEW BUILD HERE
│   └── vsix package creation
│
├── copy:resource-kilocode (copies webview to resources)
├── copy:resource-host (JetBrains host)
├── copy:resource-logs
├── copy:resource-nodemodules
└── propDep
    ↓
./gradlew buildPlugin -PdebugMode=release
```

### Size Validation Logic

The script validates the final artifact size:

- **< 300MB**: Error - Missing components (likely webview or host)
- **300-400MB**: Success - Complete build
- **> 400MB**: Warning - Unexpected bloat (investigate)

This catches incomplete builds immediately.

## Files Modified

- `build-jetbrains-plugin.sh` - Complete rewrite
    - Removed dead code (manual mode handling, platform generation)
    - Added prerequisite checks
    - Integrated with official build system
    - Enhanced error reporting and validation

## Documentation Updates

Updated documentation reflects:

- Official build method usage
- Simplified command-line interface
- Clear prerequisite requirements
- Build process explanation

## Migration Guide

### For Users

**Old way:**

```bash
./build-jetbrains-plugin.sh release
```

**New way:**

```bash
./build-jetbrains-plugin.sh
```

That's it! The script now uses the official build method automatically.

### For CI/CD

If you have CI/CD pipelines using this script:

**Old:**

```yaml
- run: ./build-jetbrains-plugin.sh release
```

**New:**

```yaml
- run: ./build-jetbrains-plugin.sh
```

Or for clean builds:

```yaml
- run: ./build-jetbrains-plugin.sh --clean
```

## Conclusion

The rewritten build script:

- ✅ Eliminates the "missing UI component" issue
- ✅ Uses official Kilo Code build method
- ✅ Provides better user experience
- ✅ Reduces maintenance burden
- ✅ Ensures consistent, reliable builds

The script is now 100% aligned with the official Kilo Code development workflow and will automatically include all future UI components without requiring script modifications.
