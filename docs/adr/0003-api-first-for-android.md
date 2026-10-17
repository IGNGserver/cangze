# ADR 0003 — API first: one REST surface and one stream for every client

Status: accepted (2026-10-18)

## Decision

- Everything the web UI does goes through versioned `/api/v1` REST endpoints described by zod contracts in
  `packages/contracts`; `docs/openapi.json` is generated from them and checked in CI.
- Live updates use a single multiplexed WebSocket (`/api/v1/stream`) with topic subscriptions and per-topic
  sequence numbers so a reconnecting client (mobile networks) can resume without gaps.
- Web uses an HttpOnly cookie session; other clients use revocable device tokens issued by pairing.
- All agent execution happens on the server. Clients are thin.

## Consequences

The phase-two Android client (standard mode and conversation-first simple mode) needs no server changes
beyond push delivery, which is reserved behind a notification channel interface.
