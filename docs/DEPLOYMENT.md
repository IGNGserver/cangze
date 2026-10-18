# Deployment

Cangze ships as one multi-arch image (`linux/amd64`, `linux/arm64`):
`ghcr.io/igngserver/cangze:<version>`. All state lives in the `/data` volume.

## Docker Compose

```bash
VERSION=0.1.0
curl -fsSLO "https://github.com/IGNGserver/cangze/releases/download/v${VERSION}/compose.yaml"
curl -fsSL "https://github.com/IGNGserver/cangze/releases/download/v${VERSION}/.env.example" -o .env   # optional
docker compose up -d
docker compose logs cangze | grep -i bootstrap
```

The URLs above are pinned to a release and are intentionally not read from the `main` branch. For a formal
release, the Compose file can also be downloaded from
`https://github.com/IGNGserver/cangze/releases/latest/download/compose.yaml`.

`compose.yaml` defaults to the release it was published with (`CANGZE_VERSION`, e.g. `0.1.0`). Image tags:

| Tag      | Meaning                                                                 |
| -------- | ----------------------------------------------------------------------- |
| `0.1.0`  | one release, never moved                                                |
| `next`   | the newest prerelease                                                   |
| `latest` | the newest formal release (none yet while the project is in prerelease) |

`latest` is only published for a formal release. The default installation should use a numbered version;
use `next` only when explicitly testing the newest prerelease.

Set `CANGZE_VERSION` in `.env` to upgrade on your own schedule.

## First run

1. Open `http://<host>:8080` from a device on your local network.
2. Enter the one-time **bootstrap code** printed in the container log. It is valid until setup completes;
   restart the container to print a new one.
3. Choose an admin key (or let Cangze generate one). Store it in a password manager — it is the only
   credential.
4. Connect Home Assistant: its URL as seen _from the container_ (e.g. `http://192.168.1.10:8123`) and a
   long-lived access token of a dedicated user (HA → profile → Security → Long-lived access tokens).
5. Add a model provider and pick a default model.

## Network policy

| Client                                                                     | Default                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Loopback, private ranges (RFC 1918, CGNAT, link-local, IPv6 ULA) over HTTP | allowed                                                                        |
| Public address over HTTPS (direct or through a trusted proxy)              | allowed                                                                        |
| Public address over plain HTTP                                             | **refused**, unless enabled in _Settings → Security_ after confirming the risk |

The `Host` header must be an IP literal, `localhost`, a `*.local` / `*.lan` / `*.home.arpa` name, the host of
`CANGZE_PUBLIC_ORIGIN`, or one listed in `CANGZE_ALLOWED_HOSTS`. This blocks DNS rebinding attacks.

## HTTPS with the bundled Caddy profile

```dotenv
CANGZE_DOMAIN=home.example.com
CANGZE_PUBLIC_ORIGIN=https://home.example.com
CANGZE_TRUSTED_PROXIES=172.16.0.0/12
```

```bash
docker compose --profile https up -d
```

Caddy obtains and renews certificates automatically; ports 80 and 443 must reach the host.

## Your own reverse proxy

Forward to port 8080, pass `X-Forwarded-For` and `X-Forwarded-Proto`, allow WebSocket upgrades on
`/api/v1/stream`, and set `CANGZE_TRUSTED_PROXIES` to the proxy's address or network.

## Upgrades

```bash
docker compose pull && docker compose up -d
```

Database migrations run automatically on start. Create a backup first (_Settings → Data & backup_); see
[BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## Environment variables

| Variable                      | Default            | Purpose                                                               |
| ----------------------------- | ------------------ | --------------------------------------------------------------------- |
| `CANGZE_PORT` / `CANGZE_BIND` | `8080` / `0.0.0.0` | published port and bind address (compose)                             |
| `CANGZE_PUBLIC_ORIGIN`        | –                  | public URL; enables secure cookies and adds the host to the allowlist |
| `CANGZE_TRUSTED_PROXIES`      | –                  | CIDRs whose `X-Forwarded-*` headers are trusted                       |
| `CANGZE_ALLOWED_HOSTS`        | –                  | extra accepted `Host` names                                           |
| `CANGZE_MASTER_KEY`           | –                  | base64 32-byte key; otherwise `/data/master.key` is generated         |
| `CANGZE_LOG_LEVEL`            | `info`             | `fatal` … `trace`                                                     |
