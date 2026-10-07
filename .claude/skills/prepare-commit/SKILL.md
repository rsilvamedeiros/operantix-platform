---
name: prepare-commit
description: Prepare a Conventional Commit message for validated Operantix changes. Use only after reviewing the diff.
---

# Prepare Commit

1. Inspect current diff/status.
2. Do not commit secrets/generated junk.
3. Confirm relevant tests were run or state what is missing.
4. Produce one concise Conventional Commit subject in English (see `docs/development/commits.md`).
5. Subject only: no body and no author/co-author/session trailers. Technical detail goes in the PR description.
6. Do not perform force push or destructive git operations.
