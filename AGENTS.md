# AGENTS.md

Kilo Code is a Bun monorepo for the CLI, VS Code extension, SDK, docs, gateway, telemetry, and shared UI.
Use this file for repo-wide rules and read the nearest nested `AGENTS.md` before editing a package.
There are currently no `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` files, so root and nested `AGENTS.md` files are the instruction source of truth.

## Repo basics

- Primary branch: `main-vertex-new`
- Upstream sync branch: `kilo-new-upstream`
- Do normal work on `main-vertex-new`; treat `kilo-new-upstream` as upstream-tracking only
- Kilo Code is a fork of OpenCode, so keep shared upstream diffs small
- Key packages: `packages/opencode/`, `packages/kilo-vscode/`, `packages/sdk/js/`, `packages/app/`, `packages/kilo-ui/`, `packages/kilo-docs/`, `packages/kilo-gateway/`, `packages/kilo-telemetry/`

## Nearest guides

- **Dev**: `bun run dev` (runs from root) or `bun run --cwd packages/opencode --conditions=browser src/index.ts`
- **Dev with params**: `bun dev -- help`
- **Extension**: `bun run extension` (build + launch VS Code with the extension in dev mode). Pass `--no-build` to skip the build. When asked to run an isolated VS Code/Kilo environment, use the CLI scripts instead of interactive launch configs: `bun run extension:isolated` reuses `.kilo-dev/`, and `bun run extension:isolated:clean` clears `.kilo-dev/` first. Pass an optional workspace path after `--`, for example `bun run extension:isolated -- ../sample-project`.
- **Typecheck**: `bun turbo typecheck` (uses `tsgo`, not `tsc`). Includes the JetBrains plugin and requires Java 21; do not run `java -version` as a routine preflight. Only check Java when a Gradle/Java command fails with a Java-version or missing-Java error. If missing, install via SDKMAN: `sdk install java 21-tem && sdk use java 21-tem`. If SDKMAN is not installed, see https://sdkman.io/install.
- **Test**: `bun test` from `packages/opencode/` (NOT from root -- root blocks tests)
- **Single test**: `bun test test/tool/tool.test.ts` from `packages/opencode/`
- **CLI build artifact size check**: after `bun run script/build.ts --single --skip-install` in `packages/opencode/`, use `du -h dist/*/*/bin/kilo` (scoped package output lives under `dist/@kilocode/`)
- **SDK regen**: After changing server endpoints in `packages/opencode/src/server/`, run `./script/generate.ts` from root to regenerate `packages/sdk/js/`
- **Knip** (unused exports): `bun run knip` from `packages/kilo-vscode/`. CI runs this — all exported types/functions must be imported somewhere. Remove or unexport unused exports before pushing.
- **Source links**: After adding or changing URLs in `packages/kilo-vscode/`, `packages/kilo-vscode/webview-ui/`, or `packages/opencode/src/`, run `bun run script/extract-source-links.ts` from the repo root and commit the updated `packages/kilo-docs/source-links.md`. CI runs this check — the build fails if the file is stale.
- **kilocode_change check**: `bun run check-kilocode-change` from `packages/kilo-vscode/`. CI runs this — `kilocode_change` is a marker for upstream merge conflicts and must not appear in `packages/kilo-vscode/` or `packages/kilo-ui/` (these are entirely Kilo Code additions). Remove the markers before pushing.
- **opencode annotation check**: `bun run script/check-opencode-annotations.ts --worktree` from repo root when verifying local agent changes. CI runs `bun run script/check-opencode-annotations.ts` on PRs touching `packages/opencode/` — every Kilo-specific change in shared opencode files must be annotated with `kilocode_change` markers. Exempt paths (no markers needed): `packages/opencode/src/kilocode/`, `packages/opencode/test/kilocode/`, and any path containing `kilocode` in the name.
- **Effect facade ratchet**: Do not add runtime-backed Promise facades to shared `packages/opencode/src` Effect services; use service dependencies, `AppRuntime`, or Kilo-owned boundaries. Run `bun run script/check-opencode-promise-facades.ts` when touching service adapters.
- **workflow allowlist**: `bun run script/check-workflows.ts` from repo root. CI runs this as part of the annotations workflow — any `.yml` / `.yaml` file added to or removed from `.github/workflows/` must be reflected in the hardcoded list in `script/check-workflows.ts`. Prevents upstream-merged workflows from silently starting to run in our CI.
- **Backend/SDK programmatic testing**: see [TESTING.md](./TESTING.md) for spawning the local main-branch backend (`bun dev serve`) and driving it via `curl` — use this instead of `kilo serve` (prod binary) when testing backend fixes.

- `packages/opencode/AGENTS.md`: CLI namespaces, server, storage, process rules
- `packages/kilo-vscode/AGENTS.md`: extension architecture, webview messaging, Windows wrappers
- `packages/app/AGENTS.md`: local UI workflow and browser automation notes
- `packages/kilo-docs/AGENTS.md`: docs workflow, Markdoc rules, redirects

## Build, lint, and test commands

Run from repo root unless noted otherwise.

| Area | Checks |
|---|---|
| Root / cross-package | `bun run lint`, `bun run typecheck` |
| CLI | From `packages/opencode/`: `bun run typecheck`, `bun test` or targeted `bun test ./path/to/file.test.ts` |
| VS Code extension | From `packages/kilo-vscode/`: `bun run typecheck`, `bun run lint`, `bun run test:unit` or `bun run test` |
| Extension build/package | From `packages/kilo-vscode/`: `bun run compile` or `bun run package` when touching build, packaging, SDK, or webview integration paths |
| JetBrains plugin | From `packages/kilo-jetbrains/`: `./gradlew typecheck`, `./gradlew test`. Requires Java 21; do not run `java -version` as a routine preflight. Check Java only after a Java-version or missing-Java failure. |
| CI/local guards | Run affected guards documented above, such as `bun run knip`, `bun run check-kilocode-change`, `bun run script/check-opencode-annotations.ts --worktree`, or source link extraction |

```bash
# root
bun install
bun run dev
bun run extension
bun turbo typecheck
./packages/opencode/script/build.ts --single
./script/generate.ts
bun run script/extract-source-links.ts
bun run script/check-opencode-annotations.ts

# CLI
cd packages/opencode
bun run --conditions=browser ./src/index.ts
bun run typecheck
bun test
bun test test/tool/tool.test.ts
bun test test/server/session-messages.test.ts
./script/build.ts --single

# VS Code extension
cd packages/kilo-vscode
bun run compile
bun run watch
bun run typecheck
bun run lint
bun run format
bun run knip
bun run check-kilocode-change
bun run test -- --grep "test name"
bun test tests/unit/slim-metadata.test.ts

# JetBrains plugin
cd packages/kilo-jetbrains
./gradlew typecheck
./gradlew test

# docs
cd packages/kilo-docs
bun dev
bun run build
bun test
```

- Root `bun test` intentionally fails; do not use it for verification
- Root Prettier config uses `semi: false` and `printWidth: 120`
- For local app UI work, also run `cd packages/opencode && bun run --conditions=browser ./src/index.ts serve --port 4096`, then open `http://localhost:4444`

In each VS Code extension host, one `KiloConnectionService` is created for the sidebar, every Kilo editor tab, and Agent Manager; it lazily starts and reuses one current `kilo serve` backend at a time. Agent Manager worktree sessions pass a directory context to this shared backend rather than starting one per worktree. State captured by the active service layer, such as Snapshot `trackState`, is shared across those requests; only directory-keyed `InstanceState` data is isolated.

Extension-specific settings should live in the Kilo extension settings, not default VS Code settings, unless they are intentionally VS Code-wide.

## Package Instructions

## Generated artifacts and required follow-up
- When a task primarily touches `packages/kilo-jetbrains/`, read `packages/kilo-jetbrains/AGENTS.md` before planning or editing. It covers split-mode architecture, IntelliJ source lookup, threading fundamentals, UI guidelines, and session component architecture.

- If you change server routes in `packages/opencode/src/server/`, run `./script/generate.ts`
- If `bun run package` updates `packages/sdk/js/src/gen/`, commit those generated files
- If you change URLs in `packages/kilo-vscode/`, `packages/kilo-vscode/webview-ui/`, or `packages/opencode/src/`, run `bun run script/extract-source-links.ts`
- If you touch shared `packages/opencode/` files, run `bun run script/check-opencode-annotations.ts`

## CLI and VSIX build workflow

Always build the CLI from local source; never download upstream release binaries.

```bash
# current-platform CLI
./packages/opencode/script/build.ts --single

# optional baseline CLI
./packages/opencode/script/build.ts --single --baseline

# VSIX
bun install
cd packages/kilo-vscode
rm -rf bin/ dist/ out/ && rm -f *.vsix
cd ../..
./packages/opencode/script/build.ts --single
cd packages/kilo-vscode
bun run package
bunx vsce package --no-dependencies --skip-license --target linux-x64
```

- `--single` builds artifacts only for the current OS and CPU architecture
- `--single` skips ABI-specific variants by default and only includes the current-platform baseline build when combined with `--baseline`
- Use `./packages/opencode/script/build.ts --single` for the CLI-only current-platform build
- Use `cd packages/kilo-vscode && rm -rf bin/ dist/ out/ && rm -f *.vsix && cd ../.. && ./packages/opencode/script/build.ts --single && cd packages/kilo-vscode && bun run package` for a current-platform VSIX preparation flow
- CLI output: `packages/opencode/dist/@kilocode/cli-{platform}/bin/kilo`
- Replace `linux-x64` with the current platform target
- The VSIX must bundle the locally built CLI binary

## CLI version alignment

- Local preview CLI builds should match `packages/kilo-vscode/package.json`
- Set `KILO_VERSION` to override that default
- Validate with `packages/opencode/dist/@kilocode/cli-{platform}/bin/kilo --version`
- The VSIX-bundled CLI should match the built dist CLI
  If you need to replace the locally installed CLI after exiting a running instance:

```bash
install -m 755 \
  "/home/jguru/projects/kilocode/packages/opencode/dist/@kilocode/cli-linux-x64/bin/kilo" \
  "/home/jguru/.local/lib/node_modules/@kilocode/cli/bin/kilo"
```

## Release sync trigger

If the user says `new version`, `we have new version`, `new version was released`, or similar, treat it as an upstream sync request.

1. Check whether `main-vertex-new` has uncommitted files.
2. Update `kilo-new-upstream` from upstream `Kilo-Org/kilocode` `main`
3. Merge updated `kilo-new-upstream` into `main-vertex-new` but do not commit `main-vertex-new`
4. Resolve conflicts with priority given to project-specific behavior, favor my changes (Vertex AI fix, multiple "azure" endpoints declaration and processing, models reduction of providers for Vertex AI) In case of new improvemnts new fetures can be merged. (Favor upstream fix (if available) for: "fix(jetbrains): scale timeline bars" + "fix(vscode): restore token bar")
5. Build the local VS Code plugin using a current-platform-only CLI build with `./packages/opencode/script/build.ts --single`
6. On success, reply exactly: `New VS Code plugin (version x.y.z) is READY TO TEST!`
7. Clean workspace: 1. gitignore new build dirs if applicable (not files) 2. decide what residual files are from build and can be discarded and discard them 3. if you find files that need to be commited and are not part of merge do coherent commits. 4. do final commit of new `main-vertex-new` (should consist of new files from merge)
8. Verify that workspace is clean without uncommited files.
9. Output in MD table all new features by impact and add also second table with only significant fixes.
10. Push the repo! there are git hooks, it might take 2-3 mins and som quirks might appear. Fix it. If needed to rebuild, do it, otherwise do necessary commits and push until success.

## Git rules

- Use `git --no-pager` for inspection commands
- Avoid destructive git commands unless the user explicitly asks
- Do not amend commits unless the user explicitly asks
- Do not accidentally stage generated or unrelated files
- Respect existing user changes in a dirty worktree

## Code style

- Prefer TypeScript and Bun-native APIs such as `Bun.file()`
- Prefer `const` over `let`; prefer early returns over `else`
- Avoid `try`/`catch` unless it adds real handling; never leave an empty `catch`
- Avoid `any`; use inference unless exported APIs need explicit types
- Keep functions in one place unless extraction improves reuse or readability
- Avoid formatting-only churn
- Follow existing import ordering in the touched package
- Reuse package aliases where they exist; in `packages/opencode/`, `@/*` maps to `./src/*` and `@tui/*` maps to `./src/cli/cmd/tui/*`
- Avoid unnecessary destructuring when `obj.prop` is clearer
- Prefer short single-word locals when clear: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `state`
- Use multi-word names only when a short name would be ambiguous

## Frontend conventions

- Webview and app code use Solid, not React
- In app-style state, prefer `createStore` over many `createSignal` calls
- Reuse `@kilocode/kilo-ui` components before adding custom markup
- Preserve existing design systems and package patterns
- Test UI changes on the real target surface: app, webview, or desktop

## Errors, tests, and process spawning

- Prefer structured errors and existing helpers over raw thrown strings
- Log or surface failures; do not silently swallow them
- Run the narrowest command that proves the change
- Add or update tests when behavior changes
- Prefer real-path tests over mocks; do not duplicate implementation logic inside tests
- For CLI work, run tests from `packages/opencode/`, not root
- On Windows, process spawning must avoid console flashes
- In `packages/kilo-vscode/`, use wrappers from `src/util/process.ts` so `windowsHide: true` is enforced

## Upstream-friendly editing

- Prefer Kilo-specific paths such as `packages/opencode/src/kilocode/` and `packages/opencode/test/kilocode/`
- Keep shared-file diffs small and isolated
- Avoid refactors in upstream-derived files unless necessary
- The goal is to keep syncing with upstream straightforward

## `kilocode_change` markers

Use markers only in shared upstream-derived files, mainly under `packages/opencode/`.

```ts
const value = 42 // kilocode_change
// kilocode_change start
const foo = 1
const bar = 2
// kilocode_change end
```

Do not use these markers in paths that already contain `kilo` in the directory or filename, including `packages/kilo-vscode/`, `packages/kilo-ui/`, and `packages/opencode/src/kilocode/`.

## Commit and PR guidance

- Use Conventional Commits
- Common scopes: `vscode`, `cli`, `agent-manager`, `sdk`, `ui`, `i18n`, `kilo-docs`, `gateway`, `telemetry`, `desktop`
- Omit scope when a change spans multiple packages
- Keep commit messages focused on intent
- Keep PR descriptions to 2-3 lines: what changed and why
- Skip file-by-file inventories and pasted test logs

## Final checks

- CLI change: focused `bun test` in `packages/opencode/`
- VS Code extension change: `bun run compile`, unit tests, or `--grep` test run in `packages/kilo-vscode/`
- App change: targeted unit or Playwright tests in `packages/app/`
- Server route change: regenerate SDK
- Source link change: regenerate `packages/kilo-docs/source-links.md`
- Shared upstream file change: verify `kilocode_change` markers

## Code Style

- Avoid possibly out-of-bounds array access. Instead of `array[index] ?? {}`, use `array.at(index) ?? {}`. Instead of `array[array.length - 1]`, use `array.at(-1)`
- Prefer `Promise.withResolvers<T>()` for deferreds when runtime/types support it; allow callback/event executors, not async executors or redundant Promise wrapping.

### Prefer ternary over reassignment

Good:

```ts
const foo = condition ? 1 : 2
```

Bad:

```ts
let foo

if (condition) foo = 1
else foo = 2
```

Prefer `const`. Replace `let` + if/else assignment with a ternary or an IIFE. Reassignment is the only legitimate reason to reach for `let`.

### Naming Enforcement (Read This)

THIS RULE IS MANDATORY FOR AGENT WRITTEN CODE.

- Use single word names by default for new locals, params, and helper functions.
- Multi-word names are allowed only when a single word would be unclear or ambiguous.
- Do not introduce new camelCase compounds when a short single-word alternative is clear.
- Before finishing edits, review touched lines and shorten newly introduced identifiers where possible.
- Good short names to prefer: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`, `timeout`.
- Examples to avoid unless truly required: `inputPID`, `existingClient`, `connectTimeout`, `workerPath`.

### Avoid else statements

Prefer early returns (or an IIFE) over `else`. After an `if` that returns/throws, the `else` is redundant.

### No empty catch blocks

Never leave a `catch` block empty. An empty `catch` silently swallows errors and hides bugs. If you're tempted to write one, ask yourself:

1. Is the `try`/`catch` even needed? (prefer removing it)
2. Should the error be handled explicitly? (recover, retry, rethrow)
3. At minimum, log it via `log.error("...", { err })` so failures are visible — never `catch {}` or `catch (e) {}` with no body.

### Prefer single word naming

Default to a single-word name for variables, parameters, and helper functions. Reach for a multi-word name only when a single word would be genuinely ambiguous in context — not just because the longer name "reads nicer". The rule is about meaning, not character count: don't introduce camelCase compounds like `inputPID`, `existingClient`, `connectTimeout`, or `workerPath` when `pid`, `client`, `timeout`, or `path` is already clear from the surrounding code. See the "Naming Enforcement" section above for the preferred vocabulary.

## Testing

You MUST avoid using `mocks` as much as possible.
Tests MUST test actual implementation, do not duplicate logic into a test.

## Markdown Tables

Do not pad markdown table cells for column alignment. Use the compact form with single-space-padded content cells and a minimal separator row:

```
| Command | What it runs |
|---|---|
| `kilo serve` | The prod CLI on `$PATH`. |
```

Do **not** right-pad cells to line up columns:

```
| Command                       | What it runs             |
| ----------------------------- | ------------------------ |
| `kilo serve`                  | The prod CLI on `$PATH`. |
```

Padding makes every content change rewrite the entire table, which blows up diffs on untouched rows. Markdown files are excluded from prettier (see `.prettierignore`) so running the formatter won't re-pad them, and `script/check-md-table-padding.ts` enforces the rule in CI. Run `bun run script/check-md-table-padding.ts --fix` to auto-rewrite padded tables.

## Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/) with scopes matching packages: `vscode`, `cli`, `agent-manager`, `sdk`, `ui`, `i18n`, `kilo-docs`, `gateway`, `telemetry`, `desktop`. Omit scope when spanning multiple packages.

## Changesets

User-facing changes (features, fixes, breaking changes) require a changeset file for release notes. Run `bunx changeset add` or manually create `.changeset/<slug>.md`. Use `patch` for bug fixes, `minor` for new features, `major` for breaking changes. See `.changeset/README.md` for details.

Changeset descriptions appear directly in release notes and are read by end users. Keep them concise and feature-oriented — describe **what changed from the user's perspective**, not implementation details. Write in imperative mood (e.g. "Support exporting conversations as markdown" not "Add a new export handler that serializes session messages to .md files").

## Pull Requests

PR descriptions should explain **what** changed, **why** the change is needed, and the intent or constraints a reviewer cannot infer from the diff alone. Keep simple PRs brief, but give non-trivial changes enough context to stand on their own. Skip file-by-file inventories, test result summaries, and anything obvious from the code itself.

## GitHub Issues

When creating or managing GitHub issues for the VS Code extension or JetBrains plugin via `gh`, load `.kilo/skills/gh-issues/SKILL.md`. It covers templates, project boards (`VS Code Extension`, `Jetbrains Plugin`), title conventions, and the `gh auth refresh -s project` recovery path.

## Fork Merge Process

Kilo CLI is a fork of [opencode](https://github.com/anomalyco/opencode).

**Very important**: when planning or coding, update shared files with OpenCode as last resort! Everything is shared code from OpenCode, except folders that contain `kilo` in the name or have a parent directory that contains `kilo` in the name. Example of kilo specific folders: `packages/opencode/src/kilocode/` and `packages/kilo-docs/`. Always look for ways to implement your feature or fix in a way that minimizes changes to shared code.

### Minimizing Merge Conflicts

We regularly merge upstream changes from opencode. To minimize merge conflicts and keep the sync process smooth:

1. **Prefer `kilocode` directories** - Place Kilo-specific code in dedicated directories whenever possible:
   - `packages/opencode/src/kilocode/` - Kilo-specific source code
   - `packages/opencode/test/kilocode/` - Kilo-specific tests
   - `packages/kilo-gateway/` - The Kilo Gateway package

2. **Minimize changes to shared files** - When you must modify files that exist in upstream opencode, keep changes as small and isolated as possible.

3. **Use `kilocode_change` markers** - When modifying shared code, mark your changes with `kilocode_change` comments so they can be easily identified during merges.
   Do not use these markers in files within directories with kilo in the name

4. **Avoid restructuring upstream code** - Don't refactor or reorganize code that comes from opencode unless absolutely necessary.

5. **Mirror new config keys to the cloud schema** - When adding a `kilocode_change` key to `Config.Info` in `packages/opencode/src/config/config.ts`, also add the matching JSON Schema entry in `apps/web/src/app/config.json/extras.ts` in the [cloud repo](https://github.com/Kilo-Org/cloud). See [CLI Config Schema](packages/kilo-docs/pages/contributing/architecture/config-schema.md) for the step-by-step.

The goal is to keep our diff from upstream as small as possible, making regular merges straightforward and reducing the risk of conflicts.

### Git conflict style

`bun install` sets `merge.conflictStyle=zdiff3` repo-locally via `script/setup-git.ts` (wired into `postinstall`). Conflicts include the common ancestor between `|||||||` and `=======`, which is what `script/upstream/` and `mergiraf` rely on for structural resolution and what makes manual resolution on shared opencode files tractable. If you've overridden it in your user config, the repo-local setting takes precedence — don't override it back.

### Kilocode Change Markers

When editing shared upstream files, mark Kilo-specific lines with `kilocode_change` comments so future merges can find them. The basic forms are:

- Single line: `const value = 42 // kilocode_change`
- Multi-line block: wrap with `// kilocode_change start` / `// kilocode_change end`
- New file in a shared path: `// kilocode_change - new file` at the top
- JSX/TSX: use `{/* kilocode_change */}` (and `{/* kilocode_change start */}` / `end`)

Markers are NOT needed in paths that contain `kilocode` in the name (e.g. `packages/opencode/src/kilocode/`, `packages/opencode/test/kilocode/`) — these are entirely Kilo Code additions and won't conflict with upstream.

For decision rules on when to keep changes inline vs. extract Kilo logic, marker placement guidance, and verification commands, load `.kilo/skills/kilocode-merge-minimizer/SKILL.md`.
