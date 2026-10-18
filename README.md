# Cangze · 藏泽

> 夫藏舟于壑，藏山于泽，谓之固矣。 —— _Zhuangzi_

**Cangze** is an open-source, self-hosted AI hub for the Home Assistant you already run. It connects to
Home Assistant over its WebSocket and REST APIs (no add-on, no integration to install), and lets large
language models understand, control and automate your home — safely.

[简体中文](README.zh-CN.md)

> **Status: 0.1.1 prerelease.** Feature complete for a first release and covered by unit and end-to-end
> tests, but young. Back up regularly and expect rough edges.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/session-dark.png">
  <img alt="A session: the model searched the lights, then asked for approval before unlocking the front door" src="docs/images/session-light.png">
</picture>

## Highlights

- **Sessions** — create as many equal conversations as you like. Each one has its own model, context and
  history, can branch, and streams tool calls live.
- **Subagents** — persistent, globally shared agents with their own memory and conversation. Main sessions
  create and manage them; they run on schedules or Home Assistant events, under device permissions that the
  backend enforces (default deny, area/device/label aware, parameter bounds, approvals for risky actions).
- **Deep Home Assistant integration** — states, history, logbook, statistics, services with schema
  validation, areas/floors/devices/labels, automations, scripts, scenes, calendars, to-do lists.
- **Conflict handling** — human changes win, priorities between agents, flap and loop protection.
- **Approvals** — unlocking doors, disarming alarms, opening garage doors and configuration changes ask you
  first, in the session or in the notification center.
- **Backups** — scheduled and manual backups of the single database, optionally encrypted with a passphrase,
  restored from the UI.
- **Private by default** — one container, one SQLite file, encrypted credentials, no telemetry. Safe network
  defaults with optional HTTPS via Caddy.

<table>
  <tr>
    <td><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/devices-dark.png">
  <img alt="Devices with live state and quick controls" src="docs/images/devices-light.png">
</picture></td>
    <td><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/agent-dark.png">
  <img alt="A subagent with its definition, permissions, triggers, memory and runs" src="docs/images/agent-light.png">
</picture></td>
  </tr>
</table>

## Quick start

```bash
mkdir cangze && cd cangze
VERSION=0.1.1
curl -fsSLO "https://github.com/IGNGserver/cangze/releases/download/v${VERSION}/compose.yaml"
docker compose up -d
docker compose logs cangze | grep -i bootstrap
```

The Compose file is downloaded from the versioned release asset, not from `main`. For a formal release, you
can instead use `https://github.com/IGNGserver/cangze/releases/latest/download/compose.yaml`.

Open `http://<host>:38417`, enter the bootstrap code from the log, choose your admin key, and the welcome
wizard walks you through connecting Home Assistant (URL + long-lived access token of a dedicated user) and
adding a model provider — OpenAI, Anthropic, DeepSeek, Qwen, Gemini and others are built in, and any
OpenAI- or Anthropic-compatible endpoint (Ollama, vLLM, LM Studio, gateways) works too.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS, reverse proxies, backups and upgrades.

## Documentation

- [Deployment](docs/DEPLOYMENT.md) · [Backup and restore](docs/BACKUP_RESTORE.md)
- [Permissions](docs/PERMISSIONS.md) · [API](docs/API.md) ([OpenAPI](docs/openapi.json))
- [Architecture](docs/ARCHITECTURE.md) · [Architecture decisions](docs/adr)
- [Release notes](docs/releases)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

[Apache-2.0](LICENSE)
