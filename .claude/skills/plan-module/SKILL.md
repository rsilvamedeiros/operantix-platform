---
name: plan-module
description: Plan an Operantix implementation module before coding. Use when starting or resuming a docs/workflow/module-*.md module.
---

# Plan Module

Input: `$ARGUMENTS` should identify the module document.

1. Read the module, related ADRs and existing code.
2. Report current state vs deliverables.
3. Identify the smallest vertical slice.
4. List files likely to change.
5. List contracts/data migrations needed.
6. List security, tenancy, failure-mode and observability requirements.
7. Define tests and commands.
8. Call out non-goals explicitly.
9. Do not implement until the plan is coherent with existing code.
