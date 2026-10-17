# ADR 0004 — Backend-enforced, default-deny permissions for subagents

Status: accepted (2026-10-18)

## Decision

- Every call that changes Home Assistant goes through `HaGateway`, which requires a `Principal`
  (admin UI, main session, subagent run). The gateway calls `PolicyEngine` itself; the tool hook is only the
  first line of defence. A repository guard (`pnpm verify:boundaries`) fails if any other module talks to the
  HA socket directly.
- Subagent rules are default deny. A rule selects targets (entity id/glob, domain, area, floor, device,
  label), grants an access level (read, control, configure) optionally narrowed to services, and may carry
  constraints (numeric bounds on service data, time windows, rate limits).
- Area/device/floor/label targets in a service call are expanded to entities before authorization and the
  call is re-issued with explicit `entity_id`s, so a broad target cannot reach an unauthorized entity.
- High-risk domains (locks, alarm panels, covers marked as garage/gate, configuration tools) have a risk
  policy: main sessions ask for confirmation by default; subagents get allow / deny / require approval.

See `docs/PERMISSIONS.md` for the rule language.
