import { test, expect } from "bun:test"
import { DiffEngine } from "../../src/kilocode/snapshot/diff-engine"
import { Log } from "../../src/util/log"

Log.init({ print: false })

test("shouldSkip returns undefined for small inputs", () => {
  expect(DiffEngine.shouldSkip("a", "b")).toBeUndefined()
  expect(DiffEngine.shouldSkip("hello\nworld", "hello\nworld!")).toBeUndefined()
})

test("shouldSkip returns 'oversized' when bytes exceed MAX_INPUT_BYTES", () => {
  const big = "x".repeat(DiffEngine.MAX_INPUT_BYTES + 1)
  expect(DiffEngine.shouldSkip(big, "small")).toBe("oversized")
  expect(DiffEngine.shouldSkip("small", big)).toBe("oversized")
})

test("shouldSkip returns 'too-many-lines' when lines exceed MAX_INPUT_LINES", () => {
  const many = "a\n".repeat(DiffEngine.MAX_INPUT_LINES + 5)
  expect(DiffEngine.shouldSkip(many, "small")).toBe("too-many-lines")
  expect(DiffEngine.shouldSkip("small", many)).toBe("too-many-lines")
})

test("shouldSkip runs in <50ms on pathological inputs", () => {
  const before = "before_line\n".repeat(10_000)
  const after = "after_line\n".repeat(10_000)
  const start = Date.now()
  const result = DiffEngine.shouldSkip(before, after)
  const elapsed = Date.now() - start
  expect(result).toBe("too-many-lines")
  expect(elapsed).toBeLessThan(50)
})
