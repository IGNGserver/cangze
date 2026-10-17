# Cangze · 藏泽

> 夫藏舟于壑，藏山于泽，谓之固矣。 —— _Zhuangzi_

**Cangze** is an open-source, self-hosted AI hub for the Home Assistant you already run. It connects to
Home Assistant over its WebSocket and REST APIs (no add-on, no integration to install), and lets large
language models understand, control and automate your home — safely.

[简体中文](README.zh-CN.md)

## Highlights

- **Sessions** — create as many equal conversations as you like. Each one has its own model, context and
  history, can branch, and streams tool calls live.
- **Subagents** — persistent, globally shared agents with their own memory and conversation. Main sessions
  create and manage them; they run on schedules or Home Assistant events, under device permissions that the
  backend enforces (default deny, area/device/label aware, parameter bounds, approvals for risky actions).
- **Deep Home Assistant integration** — states, history, logbook, statistics, services with schema
  validation, areas/floors/devices/labels, automations, scripts, scenes, calendars, to-do lists.
- **Conflict handling** — human changes win, priorities between agents, flap and loop protection.
- **Private by default** — one container, one SQLite file, encrypted credentials, no telemetry. Safe network
  defaults with optional HTTPS via Caddy.

## Quick start

```bash
mkdir cangze && cd cangze
curl -fsSLO https://raw.githubusercontent.com/IGNGserver/cangze/main/compose.yaml
docker compose up -d
docker compose logs cangze | grep -i bootstrap
```

Open `http://<host>:8080`, enter the bootstrap code from the log, choose your admin key, connect Home
Assistant (URL + long-lived access token) and add a model provider.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS, reverse proxies, backups and upgrades.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Architecture decisions](docs/adr)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## License

[Apache-2.0](LICENSE)
