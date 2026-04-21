---
"kilo-code": patch
---

Restore mid-turn message injection. Sending a new message while the agent is running now cancels the current turn and processes the new message immediately. Pending review suggestions are dismissed automatically so a new prompt after a review is never stuck behind a showing suggestion.
