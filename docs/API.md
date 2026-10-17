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
