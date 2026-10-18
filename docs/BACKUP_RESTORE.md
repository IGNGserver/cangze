# Backup and restore

Everything Cangze knows lives in one SQLite database in the data volume (`/data/cangze.db`) plus the master key
(`/data/master.key`, unless you set `CANGZE_MASTER_KEY`). Backups are consistent online snapshots of the database; the
hub keeps running while they are taken.

## Creating backups

- **Settings → Data & backup → Back up now**, or `docker compose exec cangze node dist/cli.js backup`.
- Automatic backups run every night at 03:30 home time by default and keep the newest 7 (configurable).
- Files are written to `/data/backups/*.czbak`. Copy them somewhere else — a backup on the same disk does not survive
  a disk failure.

### Encryption and credentials

Credentials (HA token, model API keys) are stored encrypted with the master key. A backup always contains them in
encrypted form, but **not** the master key itself unless you ask for it:

| Backup                            | Restore on the same installation | Restore on another installation                     |
| --------------------------------- | -------------------------------- | --------------------------------------------------- |
| plain                             | everything works                 | data restored; re-enter the HA token and model keys |
| encrypted with passphrase         | everything works                 | data restored; re-enter credentials                 |
| encrypted + _include credentials_ | everything works                 | everything works (the master key is restored)       |

Including credentials is only possible for passphrase-encrypted backups. Encryption uses scrypt + AES-256-GCM.
The passphrase cannot be recovered.

## Restoring

1. **Settings → Data & backup → Restore** (stored backup) or **Upload and restore** (`.czbak` file), or
   `docker compose exec cangze node dist/cli.js restore /data/backups/<file>` followed by a restart.
2. The archive is validated (format, passphrase, SQLite integrity, schema not newer than this version) and staged.
3. The hub restarts (compose `restart: unless-stopped` brings it back). Before the database is opened, the current
   database is saved as a `pre-restore` backup, the staged one is put in place and migrations run.
4. If the backup's credentials do not match this installation's master key, stored credentials are cleared and a
   notification asks you to enter them again.

A restore replaces _all_ data, including web sessions and device tokens, so you may need to sign in again.

## Recovering access

Lost the admin key? `docker compose exec cangze node dist/cli.js reset-admin`, restart, and finish setup with the new
bootstrap code from the log. No data is lost.

## Retention

Audit records and finished subagent runs older than 90 days, and usage statistics older than 400 days, are removed
every night (Settings → Data & backup → Retention).
