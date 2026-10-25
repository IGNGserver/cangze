# Cangze architecture

Cangze is a self-hosted AI hub for an existing Home Assistant (HA) installation. It runs as one container,
talks to HA over the WebSocket and REST APIs with a long-lived access token, and never installs anything
inside HA. Key decisions are recorded in [`docs/adr`](adr).

```
 Web UI / future Android ── REST /api/v1 + WS /api/v1/stream ──┐
                                                                ▼
┌────────────────────────────── cangze (Node 24) ──────────────────────────────┐
│ network access policy → authentication (admin key / device tokens)            │
│                                                                               │
│ Session engine ──┐                                                            │
│ Subagent runs  ──┼─→ Tool registry ─→ PolicyEngine ─→ HaGateway ─────────────┼─→ Home Assistant
│ (scheduler)    ──┘        ▲            (default deny)   (coordination)        │
│                    pi-agent-core + pi-ai ─→ LLM providers                     │
│ audit · usage ledger · notifications · backup · encrypted secrets             │
│ SQLite (WAL) + append-only migrations                              /data      │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path                 | Content                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/server`        | Fastify 5 server, `src/modules/<module>/`                                                                     |
| `apps/web`           | React 19 SPA (antd 6, @ant-design/x 2.x, Fluent 2 theme), built into `apps/web/dist` and served by the server |
| `apps/e2e`           | Playwright end-to-end suite against an in-memory Home Assistant and a rule-based model API (`env.ts`)         |
| `packages/contracts` | zod schemas shared by server and web: REST payloads, WS events, permission rules                              |
| `docs/openapi.json`  | generated from the route schemas, checked by `pnpm openapi:check`                                             |

## Server modules

| Module          | Responsibility                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `core`          | config, logger (pino + in-memory ring buffer), errors, ids, crypto helpers, event bus          |
| `db`            | SQLite connection, pragmas, append-only migrations (no ORM)                                    |
| `network`       | request admission: private-network HTTP, public HTTPS, opt-in public HTTP, Host allowlist      |
| `auth`          | first-run bootstrap code, admin key (scrypt), cookie sessions, device tokens, login rate limit |
| `secrets`       | AES-256-GCM secret box keyed by the master key (`/data/master.key` or `CANGZE_MASTER_KEY`)     |
| `settings`      | typed key/value settings                                                                       |
| `providers`     | LLM provider and model configuration on top of pi-ai, connection tests                         |
| `ha`            | `HaGateway`: connection, entity/registry caches, service catalog, event fan-out, REST helpers  |
| `policy`        | permission rules, target expansion, risk classification                                        |
| `coordination`  | entity arbitration between humans, sessions and subagents; flap and loop protection            |
| `approvals`     | pending approvals for risky actions                                                            |
| `conversations` | entry tree store shared by main sessions and subagent sessions, compaction                     |
| `engine`        | `AgentRunner`: builds a pi `Agent`, streams events, persists entries                           |
| `tools`         | tool registry: HA tools, subagent management tools, memory tools, notification tools           |
| `sessions`      | main sessions                                                                                  |
| `agents`        | subagent definitions, revisions, memory                                                        |
| `scheduler`     | triggers, durable run queue, workers, budgets                                                  |
| `audit`         | audit log and usage ledger                                                                     |
| `notifications` | in-app inbox, channel interface for future push                                                |
| `backup`        | online backup, optional passphrase encryption, restore                                         |
| `stream`        | WebSocket hub: topics, sequence numbers, resume                                                |

## Entity placement

`HaEntity.placement` is computed by `HaRegistry` from Home Assistant's registries and tells clients
where an entity belongs: `room` (an explicit area, or a physical device with an area), `unassigned`
(a room-capable entity or physical device without an area), `config` (automation/script/scene without
an explicit area), `integration` (entities of HA `service` devices such as Sun, Backup and Google
Translate TTS), and `household` (person, todo and helper entities). Room views group only
`room`/`unassigned`; `config` entities live on the Automations page; service and household entities are
not room devices. `HaDevice.entry_type` is preserved so a service device is never mistaken for a
physical one.

## Principals

Every action is attributed to a principal:

- `admin` — a human using the web UI or a device token directly (device page controls, settings).
- `session:<id>` — a main session. Main sessions are equal and have full rights; risky actions follow the
  confirmation policy.
- `agent:<id>@<revision>/run:<runId>` — a subagent run. Bound by its permission rules.
- `system` — internal maintenance (backups, compaction).

## Conversations

A conversation is a tree of entries; each entry has a `parentId` and the conversation has an
`activeLeafId`. Entry kinds: `message` (pi `AgentMessage`: user, assistant, toolResult), `compaction`
(summary that replaces everything before `firstKeptEntryId` when building context), `model_change`,
`notice` (task reports, system notices — not sent to the model unless converted). Editing a user message
creates a sibling branch; the UI shows `‹ 2/3 ›` switchers. Building context walks from the active leaf to
the root, then applies the newest compaction on that path.

Compaction runs automatically when the estimated context exceeds 80 % of the model's window (and on
request): older entries are summarized by the session's model and recorded as a `compaction` entry.

## Runs and streaming

A main-session prompt or a subagent trigger creates a _run_. `AgentRunner` creates a pi `Agent` with the
conversation context, the principal's tools and hooks, subscribes to its events and:

1. persists each completed message as an entry,
2. publishes stream events on the topic `session:<id>` or `run:<id>` with a monotonically increasing
   `seq`; the last 2000 events per topic are buffered for resume,
3. records usage in the ledger.

Prompting a busy session queues the message as _steer_ (default) or _follow-up_.

## Subagents

Subagents are global objects. A definition is stored as immutable revisions (instructions, model, tools,
permission rules, risk policy, limits, context mode); updates carry `baseRevision` for optimistic
concurrency because several equal main sessions may edit the same agent. Each subagent owns:

- a conversation (context mode `continuous`: every run appends to it and it is compacted; or `isolated`:
  each run starts from instructions + memory + recent run summaries),
- a memory store (titled notes the agent reads and writes through memory tools; the admin can edit them),
- triggers: `cron`, `interval`, `ha_state` (entity state/attribute change with optional `from`/`to`/`for`),
  `ha_event` (event type + data match), `ha_trigger` (any HA trigger platform via `subscribe_trigger`),
  `manual` (dispatched by a main session or the admin).

Continuous conversations compact at model-request boundaries, including during tool-heavy runs. The
summary is an append-only entry, includes the previous summary, and never restores already compacted
history. Summary generation shares the run's cancellation signal, model and usage accounting. It is
untrusted conversation data, not instructions or permission grants. Restart never resumes interrupted
device operations; missing tool results are repaired with errors, not replayed.

Custom model prices are optional USD per million input/output/cache tokens. Missing prices mean unknown,
not free; explicitly configuring all prices as zero means free. Daily budgets require known prices and
are checked before each model request and tool execution. They are soft limits on settled usage: an
in-flight request can overshoot. Summaries count toward the same budget. Stops during context preparation
cancel that preparation too and cannot launch a later reply.

Users can read a subagent's full conversation and run history but cannot post into it. Main sessions
dispatch tasks with `agent_run`; every terminal outcome is delivered once to a durable report inbox and
the originating session. Reports wait until an active reply ends, then become notices and start one
continuation against the updated transcript. At most eight automatic continuations run between user
messages; abort/archive suppresses automatic wakeups. Device writes are never replayed after restart.

## Scheduler

Schedule deadlines are persisted before timers are armed. Restart catch-up consumes each overdue deadline
at most once; interval cadence survives reconnects and unrelated definition edits. State-duration waits
are persisted, but downtime counts only when HA's state timestamp still matches on reconnect. Unreadable
trigger payloads never enter model context. Emergency stop is distinct from pausing automatic triggers.

Triggers enqueue rows in `runs`. A worker pool (global concurrency, default 2) claims queued runs.
Per-agent overlap policy: `skip`, `queue` or `replace`. Misfired schedules after downtime: `run_once` or
`skip`. Each run has a wall-clock timeout and tool-call limit; the agent has a daily cost budget. Event
triggers are debounced per trigger. Runs that wait for approval keep their worker slot (status `waiting_approval`) until the decision or timeout.

Cron expressions, time windows in permission rules and the backup schedule use the **Home Assistant time
zone** (from `get_config`; the server's zone until HA is connected). The web UI shows timestamps such as
"next trigger" in the browser's local time.

## Coordination

`coordination` tracks recent writes per entity (`who`, `when`, `context id`). Rules applied in the gateway
before a write:

- **Human priority**: a state change whose HA context carries a user id other than Cangze's own HA user is a
  manual change. Subagents may not change that entity for the agent's `respectManualMinutes` (default 30).
- **Priority**: main sessions outrank subagents; subagents carry a numeric priority. A lower-priority
  writer may not override a higher-priority writer's change within the hold window (default 5 minutes).
- **Flap protection**: at most N writes per entity per minute across all principals (default 6).
- **Loop protection**: events whose context id originates from a run's own calls do not trigger that same
  agent; trigger chains deeper than 3 are dropped.
- **Run leases**: two runs may not hold writes to the same entity concurrently; the second waits briefly
  and then gets a conflict error.

Conflicts are returned to the model as tool errors with an explanation, and audited.

## Web reliability

Agent editing keeps the original revision and definition as a three-way merge base. Remote-only
changes are preserved; divergent fields require an explicit local/remote choice before rebasing the
draft. Arrays (especially permissions and triggers) are atomic to avoid silently combining grants.
Resolving a conflict does not save: the next PUT still uses optimistic revision checking. Trigger JSON
is controlled draft text; invalid or non-object JSON blocks saving and firing until fixed or discarded.

Composer drafts are separate server-side records: one singleton `new` draft and one per session.
Text saves use optimistic revisions; attachment changes bump the same revision. The `drafts` stream
topic pushes full draft text plus image metadata (bytes are fetched from an authenticated endpoint),
and a stale save or send is rejected so two devices cannot silently overwrite each other. Sending
the first message creates the session, persists the user entry and consumes the draft in one
transaction, so clicking "new session" never leaves an empty conversation.

The mobile shell includes the same notification inbox as desktop. Reconnects refresh REST-backed
views; a stream instance identifier distinguishes restarts even when topic sequence numbers coincide.
Conversation snapshots buffer concurrent events and replay only those newer than the snapshot.
Run history uses stable `(queued_at, id)` keyset pagination, including equal-millisecond runs.

## Security model

- Single administrator key. First boot prints a one-time bootstrap code to the container log; the setup
  wizard exchanges it for the admin key the user chooses (or a generated one).
- Web sessions: random 256-bit token in an HttpOnly, SameSite=Strict cookie, stored hashed. Device tokens
  for other clients, stored hashed, revocable, shown once.
- Network admission (default): loopback, RFC 1918, CGNAT, link-local and IPv6 ULA clients may use HTTP;
  public clients must arrive over HTTPS (directly or via a trusted proxy). Public HTTP can be enabled in
  settings after typing a confirmation phrase; the UI then shows a permanent warning.
- `Host` must match the configured allowlist (defaults: localhost, IP literals, `*.local`, configured
  public origin) to defeat DNS rebinding. State-changing requests require a matching `Origin`.
- Every response carries a strict Content Security Policy (`script-src 'self'`, no inline scripts,
  `frame-ancestors 'none'`; inline styles are allowed for antd's CSS-in-JS), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`; HSTS over
  HTTPS. Model output is rendered as Markdown with raw HTML escaped and sanitized.
- Tool arguments that end up in Home Assistant REST paths (entity ids) are checked against the canonical
  `domain.object_id` form. Secrets are encrypted at rest and never logged.
- HA: Cangze detects whether its token belongs to an HA administrator; configuration tools are disabled
  otherwise.

## Data model (summary)

`settings`, `secrets`, `auth_sessions`, `device_tokens`, `providers`, `conversations`, `entries`,
`sessions`, `drafts`, `draft_attachments`, `agents`, `agent_revisions`, `agent_triggers`,
`agent_memory`, `runs`, `approvals`, `audit_log`, `usage_ledger`, `notifications`, `backups`.
See `apps/server/src/db/migrations`.
