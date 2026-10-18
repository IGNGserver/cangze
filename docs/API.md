# Cangze API

The REST surface is described by [`openapi.json`](openapi.json), generated from the zod contracts in
`packages/contracts`. This page covers what OpenAPI cannot express: authentication flows and the
WebSocket stream. Every client — the web UI and the future Android app — uses exactly this API.

## Conventions

- Base path `/api/v1`. JSON bodies, UTF-8. Timestamps are ISO 8601 strings in UTC.
- Errors use one envelope: `{ "error": { "code": "invalid_admin_key", "message": "…", "details": … } }`.
  `code` is stable and machine readable; `message` is English and meant for logs.
- Lists that can grow without bound are paginated with `?cursor=&limit=` and return `{ items, nextCursor }`.

## Authentication

| Client                     | Credential                                                           | How                                                     |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Web UI                     | `cangze_session` cookie (HttpOnly, SameSite=Strict, Secure on HTTPS) | `POST /api/v1/auth/login` with the admin key            |
| Devices (Android, scripts) | `Authorization: Bearer czd_…`                                        | pairing code or a token created in _Settings → Devices_ |

- **First run.** `GET /api/v1/system/info` reports `setupRequired: true`. The container log prints a
  bootstrap code; `POST /api/v1/setup { bootstrapCode, adminKey? }` stores the admin key (or generates one
  and returns it once) and signs the browser in.
- **Cookie requests that change state** (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` header
  matching the `Host` (or `CANGZE_PUBLIC_ORIGIN`); otherwise `403 origin_mismatch`. Bearer requests are
  exempt.
- **Pairing.** The web UI calls `POST /api/v1/auth/pairing` and shows the returned `uri`
  (`cangze://pair?origin=…&code=…`) as a QR code. The device calls the public
  `POST /api/v1/auth/pairing/claim { code, name, platform }` within 10 minutes and receives its token once.
- Failed admin-key, bootstrap and pairing attempts are rate limited per client address (5 per 15 minutes)
  and globally; locked out requests get `429 rate_limited` with `details.retryAfter` seconds.
- Recovery: `docker compose exec cangze node dist/cli.js reset-admin`, then restart to get a new bootstrap
  code. No data is lost.

## WebSocket stream

`GET /api/v1/stream` upgrades to a WebSocket. Authenticate like any request (cookie or bearer header).
Messages are JSON text frames.

Client → server:

```json
{ "op": "subscribe", "topic": "session:ses_01…", "since": 41 }
{ "op": "unsubscribe", "topic": "session:ses_01…" }
{ "op": "ping", "t": 1760000000000 }
```

Server → client:

```json
{ "type": "hello", "serverTime": 1760000000000, "version": "0.1.0" }
{ "type": "subscribed", "topic": "session:ses_01…", "seq": 44, "gap": false }
{ "type": "event", "topic": "session:ses_01…", "seq": 42, "data": { "kind": "message_delta", … } }
{ "type": "error", "code": "bad_topic", "message": "Unknown topic", "topic": "…" }
```

- Every topic has its own monotonically increasing `seq`. After a reconnect, subscribe with `since` = the
  last seq you processed; missed events are replayed. If the server no longer buffers that far back (or it
  restarted), `subscribed.gap` is `true` — reload the topic's REST snapshot, then continue with live events.
- Topics: `sessions`, `session:<id>`, `runs`, `run:<id>`, `agents`, `agent:<id>`, `approvals`,
  `notifications`, `ha:status`, `ha:states`, `system`.
- The server pings every 25 s and drops clients that do not answer, and closes clients whose send buffer
  exceeds 8 MB (`1013`). Cross-site pages using the cookie are closed with `1008`.

## Sessions

A session's conversation is a tree; `GET /api/v1/sessions/:id` returns the **active branch** (`entries`), the running
reply (`live`), pending approvals and `streamSeq`. Subscribe to `session:<id>` with `since: streamSeq` to continue
from the snapshot without gaps.

| Event `data.kind`                         | Meaning                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `run_start` / `run_end`                   | a reply started / finished (`status`: `completed`, `aborted`, `error`)            |
| `partial`                                 | the assistant message being streamed (full snapshot, throttled to ~12/s)          |
| `entry`                                   | a persisted entry (user, assistant, toolResult, notice, compaction, model_change) |
| `tool_start` / `tool_update` / `tool_end` | tool execution progress                                                           |
| `approval`                                | an approval was created or decided                                                |
| `queued`                                  | messages waiting to be injected into the running reply                            |
| `session`                                 | title / model / pin / archive changed                                             |
| `reload`                                  | the active branch moved (edit, branch switch); reload the snapshot                |

- `POST /sessions/:id/messages` starts a reply, or — while one is running — injects the message after the current
  step (`whenBusy: "steer"`, default) or after the reply (`"followUp"`).
- `POST /sessions/:id/edit` re-asks from an edited user message as a new branch; `/regenerate` answers a message
  again; `/branch` switches to the branch containing an entry. Old branches are never deleted.
- High-risk actions pause the tool until `POST /approvals/:id/decide { approve }`.

## Subagents

- `GET/POST /agents`, `GET/PUT/DELETE /agents/:id` — a `PUT` must carry `baseRevision`; a stale revision returns
  `409 revision_conflict` with `details.currentRevision`. Every save creates a new immutable revision
  (`GET /agents/:id/revisions`).
- `POST /agents/:id/run { task? }` queues a manual run; `GET /runs?agentId=&status=`, `GET /runs/:id` (read-only
  transcript, live state, pending approvals, `streamSeq`), `POST /runs/:id/abort`.
- Live updates: `agents` (list changes), `agent:<id>` (definition, memory and run changes), `runs`, and `run:<id>` with the
  same event kinds as `session:<id>`.
- `GET /agents/:id/permissions` and `POST /agents/permissions/preview` resolve rules to entity lists.
- `GET /scheduler/upcoming` lists the next scheduled firings.
- Subagent conversations cannot be written to by clients.
