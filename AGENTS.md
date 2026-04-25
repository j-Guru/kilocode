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

- `packages/opencode/AGENTS.md`: CLI namespaces, server, storage, process rules
- `packages/kilo-vscode/AGENTS.md`: extension architecture, webview messaging, Windows wrappers
- `packages/app/AGENTS.md`: local UI workflow and browser automation notes
- `packages/kilo-docs/AGENTS.md`: docs workflow, Markdoc rules, redirects

## Build, lint, and test commands

Run from repo root unless noted otherwise.

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

# app
cd packages/app
bun dev -- --port 4444
bun run typecheck
bun run test:unit
bun test --preload ./happydom.ts ./src/context/model-variant.test.ts
bun run test:e2e
playwright test e2e/session/session-review.spec.ts

# docs
cd packages/kilo-docs
bun dev
bun run build
bun test
```

- Root `bun test` intentionally fails; do not use it for verification
- Root Prettier config uses `semi: false` and `printWidth: 120`
- For local app UI work, also run `cd packages/opencode && bun run --conditions=browser ./src/index.ts serve --port 4096`, then open `http://localhost:4444`

## Generated artifacts and required follow-up

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
4. Resolve conflicts with priority given to project-specific behavior, favor my changes (like Vertex AI fix, models reduction in providers etc.) In case of new improvemnts new fetures can be merged.
5. Build the local VS Code plugin using a current-platform-only CLI build with `./packages/opencode/script/build.ts --single`
6. On success, reply exactly: `New VS Code plugin (version x.y.z) is READY TO TEST!`
7. Clean workspace: 1. gitignore new build dirs if applicable (not files) 2. decide what residual files are from build and can be discarded and discard them 3. if you find files that need to be commited and are not part of merge do coherent commits. 4. do final commit of new `main-vertex-new` (should consist of new files from merge)
8. Verify that workspace is clean without uncommited files.

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
