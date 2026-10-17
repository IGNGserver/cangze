# ADR 0001 — Single container, Node 24, SQLite

Status: accepted (2026-10-18)

## Context

Cangze targets ordinary home users who already run Home Assistant. They deploy with Docker Compose on a
NAS, a Raspberry Pi or a mini PC. There is exactly one administrator. Every extra service in the compose
file is something a non-expert has to keep healthy, back up and upgrade.

## Decision

- One container runs one Node 24 process that serves the REST API, the WebSocket stream and the built web UI.
- Persistence is a single SQLite database (`better-sqlite3`, WAL mode) under `/data`, accessed through
  prepared statements in small per-module repositories, with hand-written, append-only SQL migrations.
  An ORM would duplicate the schema in a second place without buying much for a model of this size.
- Scheduling, the run queue and the event bus are in-process and backed by SQLite tables. No Redis.
- HTTPS termination is optional and provided by a `caddy` service behind a compose profile.

## Consequences

- Backup is a consistent online SQLite backup plus a manifest; restore is a single file swap plus migrations.
- Throughput is bounded by one process. LLM calls are I/O bound and a household produces a small event
  volume, so this is acceptable; the global run concurrency limit protects the process.
- This deliberately differs from TaskDock (Postgres): Cangze is single-tenant and must stay one service.
