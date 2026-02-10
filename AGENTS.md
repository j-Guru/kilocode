# AGENTS.md

Kilo Code is an open source AI coding plugin for VS Code and JetBrains tools that generates code from natural language, automates tasks, and supports 500+ AI models.

## Branch Structure

**IMPORTANT**: This project uses a dual-branch development strategy:

- **`main`**: Fork of Kilo Code GitHub `main` branch - tracks upstream repository
- **`main-vertex`**: **Current project MAIN branch** - contains project-specific development

**All development work should be based on `main-vertex`, not `main`.**

This branching strategy allows for upstream synchronization while maintaining project-specific development.

## Fork Information

- **Merge Strategy**: We periodically merge upstream changes using scripts in `scripts/kilocode/`
- **Conflict Resolution**: Use `kilocode_change` markers to minimize merge conflicts when syncing with upstream

## Project Structure

This is a pnpm monorepo using Turbo for task orchestration:

- **`src/`** - VSCode extension (core logic, API providers, tools)
- **`webview-ui/`** - React frontend (chat UI, settings)
- **`cli/`** - Standalone CLI package
- **`packages/`** - Shared packages (`types`, `ipc`, `telemetry`, `cloud`)
- **`jetbrains/`** - JetBrains plugin (Kotlin + Node.js host)
- **`apps/`** - E2E tests, Storybook, docs

Key source directories:

- `src/api/providers/` - AI provider implementations (50+ providers)
- `src/core/tools/` - Tool implementations (ReadFile, ApplyDiff, ExecuteCommand, etc.)
- `src/services/` - Services (MCP, browser, checkpoints, code-index)
- `packages/agent-runtime/` - Standalone agent runtime (runs extension without VS Code)

## Agent Runtime Architecture

The `@kilocode/agent-runtime` package enables running Kilo Code agents as isolated Node.js processes without VS Code.

### How It Works

```
┌─────────────────────┐     fork()      ┌─────────────────────┐
│  CLI / Manager      │ ───────────────▶│  Agent Process      │
│                     │◀───── IPC ─────▶│  (extension host)   │
└─────────────────────┘                 └─────────────────────┘
```

1. **ExtensionHost**: Hosts the Kilo Code extension with a complete VS Code API mock
2. **MessageBridge**: Bidirectional IPC communication (request/response with timeout)
3. **ExtensionService**: Orchestrates host and bridge lifecycle

### Spawning Agents

Agents are forked processes configured via the `AGENT_CONFIG` environment variable:

```typescript
import { fork } from "child_process"

const agent = fork(require.resolve("@kilocode/agent-runtime/process"), [], {
	env: {
		AGENT_CONFIG: JSON.stringify({
			workspace: "/path/to/project",
			providerSettings: { apiProvider: "anthropic", apiKey: "..." },
			mode: "code",
			autoApprove: false,
		}),
	},
	stdio: ["pipe", "pipe", "pipe", "ipc"],
})

agent.on("message", (msg) => {
	if (msg.type === "ready") {
		agent.send({ type: "sendMessage", payload: { type: "newTask", text: "Fix the bug" } })
	}
})
```

### Message Protocol

| Direction      | Type           | Description                    |
| -------------- | -------------- | ------------------------------ |
| Parent → Agent | `sendMessage`  | Send user message to extension |
| Parent → Agent | `injectConfig` | Update extension configuration |
| Parent → Agent | `shutdown`     | Gracefully terminate agent     |
| Agent → Parent | `ready`        | Agent initialized              |
| Agent → Parent | `message`      | Extension message              |
| Agent → Parent | `stateChange`  | State updated                  |

### Detecting Agent Context

Code running in agent processes can check for the `AGENT_CONFIG` environment variable. This is set by the agent manager when spawning processes:

```typescript
if (process.env.AGENT_CONFIG) {
	// Running as spawned agent - disable worker pools, etc.
}
```

### State Management Pattern

The Agent Manager follows a **read-shared, write-isolated** pattern:

- **Read**: Get config (models, API settings) from extension via `provider.getState()`
- **Write**: Inject state via `AGENT_CONFIG` env var when spawning - each agent gets isolated config

```typescript
fork(agentRuntimePath, [], {
	env: { AGENT_CONFIG: JSON.stringify({ workspace, providerSettings, mode, sessionId }) },
})
```

This ensures parallel agents have independent state with no race conditions or file I/O conflicts.

## Build Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build extension (.vsix)
pnpm lint             # Run ESLint
pnpm check-types      # TypeScript type checking
```

## Development Workflow

### Setting Up Your Environment

1. Clone the repository and checkout `main-vertex` branch
2. Run `pnpm install` to install dependencies
3. Make your changes
4. Run tests: `pnpm test` (from appropriate workspace)
5. Run linting: `pnpm lint`
6. Create a changeset: `pnpm changeset` (if needed)

### Testing

- The vitest framework is used for testing
- `vi`, `describe`, `test`, `it` functions are defined by default in `tsconfig.json` (no need to import from `vitest`)
- Tests must be run from the same directory as the `package.json` file that specifies `vitest` in `devDependencies`

**Running Tests:**

```bash
# Backend tests - run from src/ directory
cd src && pnpm test path/to/test-file

# UI tests - run from webview-ui/ directory
cd webview-ui && pnpm test src/path/to/test-file

# Do NOT run from project root - causes "vitest: command not found" error
```

**Test File Naming:**

- Monorepo default: `.spec.ts` / `.spec.tsx`
- CLI package exception: `.test.ts` / `.test.tsx` (match existing CLI convention)

## Skills

- **Translation**: `.kilocode/skills/translation/SKILL.md` - Translation and localization guidelines

## Workflows

- **Add Missing Translations**: `.kilocode/workflows/add-missing-translations.md` - Run `/add-missing-translations` to find and fix missing translations

## Changesets

Each PR requires a changeset unless it's documentation-only or internal tooling. Create one with:

```bash
pnpm changeset
```

Format (in `.changeset/<random-name>.md`):

```md
---
"kilo-code": patch
---

Brief description of the change
```

- Use `patch` for fixes, `minor` for features, `major` for breaking changes
- For CLI changes, use `"@kilocode/cli": patch` instead

Keep changesets concise and feature-oriented as they appear directly in release notes.

- **Only for actual changes**: Documentation-only or internal tooling changes do not need a changeset.
- **User-focused**: Avoid technical descriptions, code references, or PR numbers. Readers may not know the codebase.
- **Concise**: Use a one-liner for small fixes. For larger features, a few words or a short sentence is sufficient.

## kilocode_change Markers

To minimize merge conflicts when syncing with upstream, mark Kilo Code-specific changes in shared code with `kilocode_change` comments.

**Single line:**

```typescript
const value = 42 // kilocode_change
```

**Multi-line:**

```typescript
// kilocode_change start
const foo = 1
const bar = 2
// kilocode_change end
```

**New files:**

```typescript
// kilocode_change - new file
```

### When markers are NOT needed

Code in these directories is Kilo Code-specific and doesn't need markers:

- `cli/` - CLI package
- `jetbrains/` - JetBrains plugin
- `agent-manager/` directories
- Any path containing `kilocode` in filename or directory name
- `src/services/ghost/` - Ghost service

### When markers ARE needed

All modifications to core extension code (files that exist in upstream Roo Code) require markers:

- `src/` (except Kilo-specific subdirectories listed above)
- `webview-ui/`
- `packages/` (shared packages)

Keep changes to core extension code minimal to reduce merge conflicts during upstream syncs.

## Code Quality Rules

### 1. Test Coverage

- Before attempting completion, always make sure that any code changes have test coverage
- Ensure all tests pass before submitting changes
- Run tests with: `pnpm test <relative-path-from-workspace-root>`
- Do NOT run tests from project root - this causes "vitest: command not found" error
- Tests must be run from inside the correct workspace:
    - Backend tests: `cd src && pnpm test path/to/test-file` (don't include `src/` in path)
    - UI tests: `cd webview-ui && pnpm test src/path/to/test-file`
- Example: For `src/tests/user.spec.ts`, run `cd src && pnpm test tests/user.spec.ts` NOT `pnpm test src/tests/user.spec.ts`

### 2. Lint Rules

- Never disable any lint rules without explicit user approval
- Run `pnpm lint` before committing
- Fix all linting errors and warnings

### 3. Error Handling

- Never use empty catch blocks - always log or handle the error
- Handle expected errors explicitly, or omit try-catch if the error should propagate
- Consider user impact when deciding whether to throw or log errors
- Provide meaningful error messages

### 4. Styling Guidelines

- Use Tailwind CSS classes instead of inline style objects for new markup
- VSCode CSS variables must be added to webview-ui/src/index.css before using them in Tailwind classes
- Example: `<div className="text-md text-vscode-descriptionForeground mb-2" />` instead of style objects
- Follow consistent formatting and naming conventions

## JetBrains Plugin Rules

### Production Build

- Always use the `build-jetbrains-plugin.sh` script in the root directory for production-ready builds
- The final plugin artifact must be approximately 300MB - 400MB in size
- A significantly smaller size (e.g., ~5MB) indicates a failed bundle that is missing the Extension Host or VSCode dependencies
- Ensure `platform.zip` is generated before building if it's missing or if dependencies changed

## Common Pitfalls

1. **Branch Confusion**: Always work on `main-vertex`, not `main`
2. **Test Execution**: Don't run tests from project root
3. **Missing Changesets**: Remember to create changesets for user-facing changes
4. **Missing kilocode_change Markers**: Mark changes in shared code properly
5. **Lint Errors**: Run linting before committing
6. **Empty Catch Blocks**: Always handle or log errors

## Quick Reference

| Task                   | Command                             |
| ---------------------- | ----------------------------------- |
| Install dependencies   | `pnpm install`                      |
| Build extension        | `pnpm build`                        |
| Run linting            | `pnpm lint`                         |
| Type checking          | `pnpm check-types`                  |
| Create changeset       | `pnpm changeset`                    |
| Run backend tests      | `cd src && pnpm test <path>`        |
| Run UI tests           | `cd webview-ui && pnpm test <path>` |
| Build JetBrains plugin | `./build-jetbrains-plugin.sh`       |
