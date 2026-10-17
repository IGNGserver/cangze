# Security policy

Cangze controls physical devices in people's homes, so we treat security reports as a priority.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting
(_Security → Report a vulnerability_ on the repository). Include the version, deployment details
(reverse proxy, HTTPS or not) and steps to reproduce. We aim to acknowledge reports within 72 hours.

## Supported versions

Only the latest release receives security fixes while the project is pre-1.0.

## Hardening checklist for operators

- Keep the default network policy (public clients must use HTTPS). Only enable public HTTP if you
  understand that your admin key and session cookie travel in clear text.
- Use a dedicated Home Assistant user for Cangze. A non-admin user disables configuration tools.
- Keep backups encrypted with a passphrase; an unencrypted backup together with `master.key` contains all
  credentials.
- Review subagent permissions; they are default deny for a reason.
