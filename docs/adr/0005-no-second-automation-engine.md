# ADR 0005 — Do not build a second deterministic automation engine

Status: accepted (2026-10-18)

## Decision

Deterministic automations belong in Home Assistant. Cangze's "automation tasks" are triggers (cron,
interval, state change, HA event, HA trigger platform, manual dispatch) that start subagent runs. Cangze
exposes HA's native automations, scripts and scenes as tools and as a management tab, so the AI can write
HA automations for the user instead of duplicating HA's engine.
