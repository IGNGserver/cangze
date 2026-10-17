# ADR 0002 — Agent engine on pi-agent-core + pi-ai, own session store

Status: accepted (2026-10-18)

## Context

The product needs many concurrent, persistent conversations (main sessions and subagent sessions), tool
calling against Home Assistant, steering while a run is active, context compaction and multi-provider model
support. Pi ships a low-level agent runtime (`@earendil-works/pi-agent-core`), a multi-provider LLM layer
(`@earendil-works/pi-ai`) and a coding-agent SDK (`pi-coding-agent`).

## Decision

- Use `pi-agent-core`'s `Agent` and `pi-ai` models directly. Do not use the coding-agent SDK: it is built
  around a working directory, file/bash tools and JSONL session files, none of which fit a server that hosts
  many sessions in one database.
- Own persistence: a conversation is a tree of entries (message, compaction, model change) with an active
  leaf, modelled on pi's session format so sessions can be exported as pi-compatible JSONL.
- Tool authorization runs in `beforeToolCall` _and_ again inside the Home Assistant gateway (see ADR 0004).

## Consequences

- We implement branching, compaction and resumable streaming ourselves (thin layer over pi's events).
- Provider credentials are passed per request (`getApiKey`), never via process environment.
