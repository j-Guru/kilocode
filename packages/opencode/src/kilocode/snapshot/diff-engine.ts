// kilocode_change - new file
//
// Input-size caps around `structuredPatch`/`formatPatch`. The npm `diff`
// package uses Myers' algorithm with full context, which is O(N*M) in time
// and memory. On files with tens of thousands of lines it can block the
// thread for minutes. That is what caused the TUI freeze where ESC no
// longer worked after a turn.
//
// `shouldSkip` is the single entry point callers import. If either side of
// a diff is clearly too big to process in a reasonable time, return a
// `SkipReason` and the caller substitutes an empty patch. Additions and
// deletions are still reported from git numstat so the summary counts stay
// accurate.

export namespace DiffEngine {
  /** Hard byte cap on a single side (before or after) of a diff. 512 KB. */
  export const MAX_INPUT_BYTES = 512 * 1024
  /** Hard line cap on a single side of a diff. */
  export const MAX_INPUT_LINES = 2000

  export type SkipReason = "oversized" | "too-many-lines"

  function lines(text: string) {
    if (!text) return 0
    const len = text.length
    if (len === 0) return 0
    let count = 1
    for (let i = 0; i < len; i++) {
      if (text.charCodeAt(i) === 10) count++
    }
    // trailing newline does not create an extra line
    if (text.charCodeAt(len - 1) === 10) count--
    return count
  }

  /** Returns the skip reason, or undefined if the inputs are small enough to diff directly. */
  export function shouldSkip(before: string, after: string): SkipReason | undefined {
    if (before.length > MAX_INPUT_BYTES || after.length > MAX_INPUT_BYTES) return "oversized"
    if (lines(before) > MAX_INPUT_LINES || lines(after) > MAX_INPUT_LINES) return "too-many-lines"
    return undefined
  }
}
