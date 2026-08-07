// Regression: the per-turn <environment_details> block must be persisted with the
// user message so later turns replay the sent bytes verbatim. Ephemeral injection
// made every Azure GPT-5.6 implicit cache breakpoint unmatchable on the next turn
// (cached_tokens always 0, full-prompt cache_write_tokens every turn).

import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode-ai/core/database/database"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { Command } from "../../src/command"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import * as CrossSpawnSpawner from "@opencode-ai/core/cross-spawn-spawner"
import { Env } from "../../src/env"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Format } from "../../src/format"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"
import { LSP } from "../../src/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "../../src/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Question } from "../../src/question"
import { Session } from "../../src/session/session"
import { SessionCompaction } from "../../src/session/compaction"
import { Instruction } from "../../src/session/instruction"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SystemPrompt } from "../../src/session/system"
import { SessionSummary } from "../../src/session/summary"
import { Todo } from "../../src/session/todo"
import { Skill } from "../../src/skill"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "../../src/tool/registry"
import { Truncate } from "../../src/tool/truncate"
import { isEnvironmentDetails } from "../../src/kilocode/editor-context"
import { KiloSessions } from "../../src/kilo-sessions/kilo-sessions"
import * as Log from "@opencode-ai/core/util/log"
import { MemoryService } from "@kilocode/kilo-memory/effect/service"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

Log.init({ print: false })

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const plugin = Layer.mock(Plugin.Service)({
  trigger: <Name extends string, Input, Output>(_name: Name, _input: Input, output: Output) => Effect.succeed(output),
  list: () => Effect.succeed([]),
  init: () => Effect.void,
})

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    instructions: () => Effect.succeed([]),
    resourceTemplates: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth in env context tests"),
    authenticate: () => Effect.die("unexpected MCP auth in env context tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in env context tests"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

const memoryNode = LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] })
const serverNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const root = LayerNode.group([
  SessionPrompt.node,
  Session.node,
  SessionProjector.node,
  MessageV2.node,
  Snapshot.node,
  LLM.node,
  Env.node,
  AgentSvc.node,
  Command.node,
  Permission.node,
  Plugin.node,
  Config.node,
  ProviderSvc.node,
  LSP.node,
  MCP.node,
  FSUtil.node,
  BackgroundJob.node,
  SessionStatus.node,
  SessionRunState.node,
  Database.node,
  EventV2Bridge.node,
  Question.node,
  Todo.node,
  ToolRegistry.node,
  Skill.node,
  Git.node,
  Ripgrep.node,
  Format.node,
  Truncate.node,
  SessionProcessor.node,
  Image.node,
  SessionCompaction.node,
  SessionRevert.node,
  Instruction.node,
  SystemPrompt.node,
  CrossSpawnSpawner.node,
  RuntimeFlags.node,
  memoryNode,
  serverNode,
])

function makeHttp() {
  return LayerNode.compile(root, [
    [SessionSummary.node, summary],
    [Plugin.node, plugin],
    [LSP.node, lsp],
    [MCP.node, mcp],
    [RuntimeFlags.node, RuntimeFlags.layer()],
    [KiloSessions.node, KiloSessions.testLayer],
  ])
}

const it = testEffect(makeHttp())

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: true,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          modalities: { input: ["text" as const], output: ["text" as const] },
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

const user = Effect.fn("env-cache.user")(function* (
  sessionID: SessionID,
  text: string,
  editorContext?: MessageV2.User["editorContext"],
) {
  const sessions = yield* Session.Service
  const msg = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "code",
    model: ref,
    time: { created: Date.now() },
    tools: {},
    editorContext,
  } satisfies MessageV2.User)
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: msg.id,
    sessionID,
    type: "text",
    text,
  } satisfies MessageV2.TextPart)
  return msg
})

const envParts = (msg: MessageV2.WithParts | undefined) =>
  msg?.parts.filter((part) => part.type === "text" && part.synthetic && isEnvironmentDetails(part.text)) ?? []

describe("editor context persistence (prompt cache stability)", () => {
  it.live(
    "persists environment_details once per user message and replays it verbatim",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ llm }) {
          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const chat = yield* sessions.create({
            title: "Env cache",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })

          const first = yield* user(chat.id, "hey", { activeFile: "src/a.ts" })
          yield* llm.text("Hey.")
          yield* prompt.loop({ sessionID: chat.id })

          let msgs = yield* sessions.messages({ sessionID: chat.id })
          const firstUser = msgs.find((msg) => msg.info.id === first.id)
          const persisted = envParts(firstUser)
          expect(persisted).toHaveLength(1)
          expect(persisted[0].type).toBe("text")
          if (persisted[0].type !== "text") throw new Error("unreachable")
          const block = persisted[0].text
          expect(block).toContain("Active file: src/a.ts")

          // the turn-1 provider request carried the block
          let bodies = (yield* llm.inputs).map((item) => JSON.stringify(item))
          expect(bodies.some((item) => item.includes(JSON.stringify(block).slice(1, -1)))).toBe(true)

          // turn 2: the replayed turn-1 bytes must include the exact block written on turn 1
          yield* user(chat.id, "hey again", { activeFile: "src/b.ts" })
          yield* llm.text("Hey again.")
          yield* prompt.loop({ sessionID: chat.id })

          msgs = yield* sessions.messages({ sessionID: chat.id })
          expect(envParts(msgs.find((msg) => msg.info.id === first.id))).toHaveLength(1)
          const secondUser = msgs.find((msg) => msg.info.role === "user" && msg.info.id !== first.id)
          expect(envParts(secondUser)).toHaveLength(1)

          // The Current time line is per-message by design; everything after it must
          // replay byte-identically so prior cache breakpoints stay matchable.
          const tail = block.slice(block.indexOf("\n"))
          bodies = (yield* llm.inputs).map((item) => JSON.stringify(item))
          const turn2 = bodies.find((item) => item.includes("hey again"))
          expect(turn2).toBeDefined()
          expect(turn2).toContain(JSON.stringify(tail).slice(1, -1))
          expect(turn2).toContain("Active file: src/a.ts")
        }),
        {
          git: true,
          config: (url: string) => ({
            ...cfg,
            provider: {
              ...cfg.provider,
              test: { ...cfg.provider.test, options: { ...cfg.provider.test.options, baseURL: url } },
            },
          }),
        },
      ),
    30_000,
  )

  it.live(
    "does not treat user-authored environment_details as persisted context",
    () =>
      provideTmpdirServer(
        Effect.fnUntraced(function* ({ llm }) {
          const prompt = yield* SessionPrompt.Service
          const sessions = yield* Session.Service
          const chat = yield* sessions.create({
            title: "User environment details",
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          })
          const text = "<environment_details>user-authored text</environment_details>"

          const msg = yield* user(chat.id, text, { activeFile: "src/current.ts" })
          yield* llm.text("Got it.")
          yield* prompt.loop({ sessionID: chat.id })

          const msgs = yield* sessions.messages({ sessionID: chat.id })
          const saved = msgs.find((item) => item.info.id === msg.id)
          expect(saved?.parts.some((part) => part.type === "text" && !part.synthetic && part.text === text)).toBe(true)
          const persisted = envParts(saved)
          expect(persisted).toHaveLength(1)
          expect(persisted[0].type).toBe("text")
          if (persisted[0].type !== "text") throw new Error("unreachable")
          expect(persisted[0].text).toContain("Active file: src/current.ts")
        }),
        {
          git: true,
          config: (url: string) => ({
            ...cfg,
            provider: {
              ...cfg.provider,
              test: { ...cfg.provider.test, options: { ...cfg.provider.test.options, baseURL: url } },
            },
          }),
        },
      ),
    30_000,
  )
})
