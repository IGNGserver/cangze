# Cangze API

Custom provider model definitions accept optional `cost` with nonnegative `input`, `output`, `cacheRead`
and `cacheWrite` rates (USD per million tokens). Omission/null means unknown, not free; explicit zero
rates mean free. A subagent with `dailyCostLimit` cannot run on an unknown-price model. Budget checks
use settled usage before requests/tools (including compaction), not a hard provider-side spending cap.
Session/run usage exposes `costUnknown`; `/usage` includes `unknownRequests` per ledger row. When any
prices are unknown, `cost` is only the known portion, not a complete total.

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
{ "type": "hello", "serverTime": 1760000000000, "version": "0.3.0" }
{ "type": "subscribed", "topic": "session:ses_01…", "seq": 44, "gap": false }
{ "type": "event", "topic": "session:ses_01…", "seq": 42, "data": { "kind": "message_delta", … } }
{ "type": "error", "code": "bad_topic", "message": "Unknown topic", "topic": "…" }
```

- Every topic has its own monotonically increasing `seq`. After a reconnect, subscribe with `since` = the
  last seq you processed; missed events are replayed. If the server no longer buffers that far back (or it
  restarted), `subscribed.gap` is `true` — reload the topic's REST snapshot, then continue with live events.
- `hello.instanceId` identifies the server process. When it changes, discard old sequence cursors and
  reload REST snapshots even if sequence numbers happen to coincide. Reconnects should also refresh
  REST-backed lists; while a conversation snapshot loads, buffer events and apply only `seq > streamSeq`.
- Topics: `sessions`, `session:<id>`, `runs`, `run:<id>`, `agents`, `agent:<id>`, `drafts`,
  `approvals`, `notifications`, `ha:status`, `ha:states`, `system`.
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

- `POST /sessions` may carry a `message` and a `draftRevision`. With a message, the session, its first
  user entry and draft consumption commit in one transaction; without one it creates an empty session
  for API clients. The web UI never creates a session until the first message is sent.
- `POST /sessions/:id/messages` starts a reply, or — while one is running — injects the message after the current
  step (`whenBusy: "steer"`, default) or after the reply (`"followUp"`). It accepts the same
  `draftRevision`; a stale draft is rejected before the message is accepted.
- `POST /sessions/:id/edit` re-asks from an edited user message as a new branch; `/regenerate` answers a message
  again; `/branch` switches to the branch containing an entry. Old branches are never deleted.
- High-risk actions pause the tool until `POST /approvals/:id/decide { approve }`.

## Drafts

The composer stores unsent content separately from conversations. `scope` is the literal `new` for
the single new-chat draft or a session id. Drafts never appear in the session list, and saving one
does not change session ordering.

- `GET /api/v1/drafts` returns `{ items, streamSeq }`. Subscribe to `drafts` with `since: streamSeq`.
- `PUT /api/v1/drafts/:scope { text, baseRevision }` returns `{ draft }`. `baseRevision: null`
  creates a draft, a number updates only that revision, and a stale revision returns
  `409 draft_conflict` with `details.draft` set to the current value (or null). Empty text with no
  images deletes the draft.
- `POST /api/v1/drafts/:scope/images { mimeType, data, width?, height? }` adds one image (at most
  four) and returns the updated draft. `GET /api/v1/drafts/:scope/images/:id` returns the bytes with
  the stored media type; `DELETE` on the same path removes it. Image bytes never travel on the
  stream: events carry only attachment metadata.
- Sending a message with `draftRevision` uses the draft's current attachments for the user message.
  The draft and its attachments are consumed atomically with the accepted message.
- Events on `drafts` are `{ kind: "upsert", draft }` and
  `{ kind: "delete", scope, revision, reason, sessionId? }`, where `reason` is `cleared`, `sent` or
  `session_deleted`. The `sessionId` is present when a new draft became a session.

## Subagents

Terminal outcomes create one report notification (with `runId` and optional `sessionId`). A reporting
session receives a durable notice and a bounded automatic continuation after its current reply ends.
Stopping or archiving that session suppresses automatic continuation, not report delivery.

- `POST /agents/:id/stop` disables automatic triggers, cancels queued tasks and aborts the active run.

- `GET/POST /agents`, `GET/PUT/DELETE /agents/:id` — a `PUT` must carry `baseRevision`; a stale revision returns
  `409 revision_conflict` with `details.currentRevision`. Every save creates a new immutable revision
  (`GET /agents/:id/revisions`).
- `POST /agents/:id/run { task? }` queues a manual run; `GET /runs?agentId=&status=`, `GET /runs/:id` (read-only
  transcript, live state, pending approvals, `streamSeq`), `POST /runs/:id/abort`.
- `GET /runs?before=<last-run-id>&limit=50` continues history in descending `(queued_at, id)` order.
  Use the last returned id, not a timestamp: several runs can be queued in the same millisecond.
  Unknown cursors are rejected with `404` rather than silently returning an empty page.
- Live updates: `agents` (list changes), `agent:<id>` (definition, memory and run changes), `runs`, and `run:<id>` with the
  same conversation event kinds as `session:<id>`. The run topic also emits `{ kind: "run", run: RunSummary }`
  when persisted status changes. Reload the run snapshot to reconcile status, usage and transcript together.
- `GET /agents/:id/permissions` and `POST /agents/permissions/preview` resolve rules to entity lists.
- `GET /scheduler/upcoming` lists the next scheduled firings.
- Subagent conversations cannot be written to by clients.
