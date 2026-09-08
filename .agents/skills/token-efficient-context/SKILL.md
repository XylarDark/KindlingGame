---
name: token-efficient-context
description: Use when planning a multi-file change, starting an agent or Composer run, or when the user asks about tokens, credits, context, @codebase, MCP bloat, or editing rules, skills, AGENTS.md, or .cursorignore.
---

# Token-efficient context

## Context hygiene

- New chat per distinct task. Do not carry a debug thread into a feature build.
- Prefer `@file` / `@symbol` over `@codebase`. Broad retrieval is for "where is X".
- Close files that are not part of the task.
- Do not paste full folders or whole-repo dumps.
- Trim tool output: failures and the relevant slice, not full passing logs.

## Model routing

Advice to the human and agent, not a hard pin.

- Default: Auto / Composer-class for routine edits, tests, boilerplate, Tab.
- Mid: Sonnet-class for most planning and mid-hard work.
- Frontier (Opus / GPT-5-class): architecture, subtle bugs, dense multi-file reasoning only. Switch back after that turn.
- Plan with a stronger model, implement with a cheaper coding model, verify separately. Do not leave a frontier model selected for a rename.

## Rules and skills budget

- Never add `alwaysApply: true` rules. If a fact is always true, put one or two lines in the host AGENTS.md instead.
- Keep skill descriptions one or two sentences. The body is free until matched.
- Do not duplicate this skill's content into language rules.

## MCP / tools

- Only enable MCP servers this project actually uses. Every connected server re-sends its manifest each turn.
- Do not add MCP servers in this template by default.

## When to skip this skill

- Single-file typo, comment, or rename.
- User said "just do it".
