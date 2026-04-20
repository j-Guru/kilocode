---
"kilo-code": patch
---

Prevent TUI freeze on turns that edit very large files by skipping patch generation for oversized file diffs. Additions and deletions are still reported so session summaries stay accurate.
