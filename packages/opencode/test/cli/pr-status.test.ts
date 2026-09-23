// kilocode_change - new file
import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { EOL } from "node:os"
import { Effect } from "effect"

// Mock @/kilo-sessions/pr-link-poller before importing the command so the
// status handler's explicit refresh call doesn't spawn `gh` or touch git.
const realPoller = await import("@/kilo-sessions/pr-link-poller")
const refresh = mock(async (_worktree: string) => undefined)

void mock.module("@/kilo-sessions/pr-link-poller", () => ({
  ...realPoller,
  refreshPrLink: refresh,
}))

import { prStatusHandler } from "../../src/cli/cmd/pr"
import { InstanceRef } from "../../src/effect/instance-ref"
import type { InstanceContext } from "../../src/project/instance-context"

let override: { platform: string; prUrl: string; prNumber: number } | { cleared: true } | undefined
let detected: { platform: string; prUrl: string; prNumber: number } | undefined

const writeSpy = spyOn(process.stderr, "write")

function lines() {
  return writeSpy.mock.calls
    .map((call) => String(call[0]))
    .join("")
    .split(EOL)
    .filter(Boolean)
}

function runStatus(worktree: string) {
  const ctx = { directory: worktree, worktree, project: {} } as unknown as InstanceContext
  const handler = prStatusHandler({
    read: async () => override,
    detect: async () => detected,
  })
  return Effect.runPromise(handler().pipe(Effect.provideService(InstanceRef, ctx)))
}

describe("pr status", () => {
  beforeEach(() => {
    override = undefined
    detected = undefined
    refresh.mockClear()
    writeSpy.mockClear()
  })

  test("prints the stored link", async () => {
    override = { platform: "github", prUrl: "https://github.com/owner/repo/pull/123", prNumber: 123 }
    await runStatus("/tmp/foo")
    expect(lines()).toEqual(["Linked PR #123 (github)", "https://github.com/owner/repo/pull/123"])
  })

  test("prints cleared", async () => {
    override = { cleared: true }
    await runStatus("/tmp/foo")
    expect(lines()).toEqual(["PR link cleared"])
  })

  test("prints the detected link", async () => {
    detected = { platform: "gitlab", prUrl: "https://gitlab.com/group/proj/-/merge_requests/45", prNumber: 45 }
    await runStatus("/tmp/foo")
    expect(lines()).toEqual(["Detected PR #45 (gitlab)", "https://gitlab.com/group/proj/-/merge_requests/45"])
  })

  test("prints no PR linked", async () => {
    await runStatus("/tmp/foo")
    expect(lines()).toEqual(["no PR linked"])
  })
})
