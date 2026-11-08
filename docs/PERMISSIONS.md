# Subagent permissions

Subagents run unattended, so everything they may do is spelled out in their definition and **enforced by the hub**,
not by the model. Main sessions are trusted (they act for the person chatting) but still ask before high-risk actions.

## Authentication boundary

A device token currently authenticates as the `admin` principal, equivalent to a direct administrator API
request. There is no implemented per-device or per-token scope, so clients and permission rules must not claim
that a token is limited to selected entities or services. Scoped device tokens are explicitly deferred for a
future design and are not part of this contract.

1. **Reads** — HA tools filter what a subagent can see: searches only return readable entities; state, history,
   logbook, camera, calendar and to-do tools refuse unreadable entities; templates and the full logbook require read
   access to everything.
2. **Writes** — every write goes through `HaGateway`, which recursively expands area/floor/device/label targets and
   groups (including nested domain groups) to concrete leaf entities before running the guards. Cyclic groups are
   rejected rather than called indirectly. The guards run in order:
   1. **coordination** — human changes win for `respectManualMinutes`, higher-priority writers are protected for the hold
      time, at most `maxWritesPerMinute` writes per entity;
   2. **policy** — the rules of the revision the run started with must allow _every_ affected entity; high-risk calls
      follow the agent's `highRisk` setting (`deny`, `approve`, `allow`);
   3. the call is sent with explicit `entity_id`s only.
3. **Tools** — subagents only get the tools listed in their definition, plus their own memory tools. Agent management
   tools (`agent_*`) can never be granted, so subagents cannot create or edit agents, including themselves.
   `memory_write` and `memory_delete` are `configure`-risk, sequential tools: they follow the agent's high-risk
   policy and cannot race another tool step in the same run.

Every decision lands in the audit log with the principal `agent:<id>@<revision>` and the run id.

## Rules

The compact `ha_overview` is also a read operation. For a subagent, its room/entity counts, labels and
configuration categories are computed only from entities allowed by that run's effective read rules; it must
not disclose an unreadable entity through an aggregate count or name. A main session and the administrator may
use the complete overview. Searches, states, history, logbook, camera, calendar, statistics, to-do and config
reads continue to enforce the corresponding entity or unrestricted-read checks.

Trigger data is untrusted input, not a permission grant or an instruction. State-trigger payloads are admitted
only after the triggering entity is readable. Opaque HA event/native-trigger payloads require unrestricted read
access, are bounded and validated before storage, and are marked as data when shown to a model. Malformed or
unreadable payloads are rejected or omitted; they never expand the agent's permissions.

Trigger data is also a read: state triggers require readable entities; opaque HA event/native-trigger
payloads require unrestricted read access. External statistics require unrestricted read access too.
Subagents cannot execute scripts, scenes or automation actions unless `allowIndirectActions` is explicitly
enabled: their downstream effects cannot be inferred from the target entity. Numeric brightness limits
cover both `brightness` and `brightness_pct`; bounded light turn-on requests must specify brightness.
Disabling an agent cancels queued automatic runs; manual tasks remain explicit requests. Emergency stop
disables triggers, cancels every queued task and aborts the active run. Already completed HA writes are not undone.

```jsonc
{
  "id": "living-lights",
  "effect": "allow", // or "deny" — deny rules always win
  "access": "control", // read < control < configure (control includes read)
  "targets": {
    "all": false,
    "entities": ["light.living_*", "switch.coffee"], // * wildcards
    "domains": ["light"],
    "areas": ["living_room"], // via the entity's own area or its device's area
    "floors": ["ground"],
    "devices": ["<device id>"],
    "labels": ["evening"], // labels of the entity, its device or its area
  },
  "services": ["turn_on", "turn_off", "light.toggle"], // empty = any service
  "constraints": {
    "numeric": [{ "field": "brightness_pct", "min": 0, "max": 60 }],
    "timeWindow": { "start": "18:00", "end": "01:00", "days": [] }, // home time zone; may cross midnight
    "maxCallsPerHour": 20,
  },
}
```

- An entity matches a rule when **any** selector matches it.
- A write is allowed when, for every affected entity, some `allow` rule at the required level matches and accepts the
  service and constraints, and no `deny` rule matches.
- Services without a target (e.g. `notify.mobile_app_phone`) need a rule whose `domains` include the service domain.
- Configuration writes (`ha_save_config`, `ha_delete_config`) need `configure` access on the config kind
  (`automation`, `script`, `scene`) or `all`.

## High-risk actions

Locks and alarm panels are high risk. `lock.lock` remains high risk even though it is a securing action;
its presence in the configured high-risk service set takes precedence over any generic "safe" action list.
Covers whose Home Assistant device class is `garage`, `gate` or `door` remain high risk for **every** cover
service, including `close_cover`. Home Assistant restarts and configuration changes are high risk too
(configurable in _Settings → Risk & approvals_). Even when rules allow them:

| Principal                                 | Behaviour                                                |
| ----------------------------------------- | -------------------------------------------------------- |
| Main session                              | waits for approval in the UI (unless disabled)           |
| Subagent, `highRisk: "deny"`              | refused                                                  |
| Subagent, `highRisk: "approve"` (default) | waits for approval; the run shows _waiting for approval_ |
| Subagent, `highRisk: "allow"`             | executed only from an administrator-authorized revision  |

Agent management is itself security-sensitive. A main session may prepare agents, but creating, updating, enabling or
deleting one through an `agent_*` tool waits for administrator approval. An approved create/update records the approval
on the immutable revision. A session-created `highRisk: "allow"` revision without that record is rejected when saved;
legacy unapproved revisions are treated as `approve` by the Gateway. Dispatching an existing `allow` agent from a main
session also requires approval of that delegation, so a session cannot borrow an unattended agent's authority to bypass
its own high-risk confirmation. Manual administrator API actions remain explicit administrator requests.

## Loops and chains

When a trigger fires because of a state change, the hub looks up who caused it through the HA context id. An agent is
never triggered by its own changes, and chains (agent A changes something that triggers agent B …) stop after
`maxChainDepth` (default 3).
