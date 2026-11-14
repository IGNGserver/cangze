# Cangze Official Website (`website/`)

Warm, approachable, everyday-home showcase website for **藏泽 (Cangze)** (<https://cangze.igng.net/>) — the open-source, self-hosted AI home hub for Home Assistant.

## Highlights

- **Warm Linen & Walnut Editorial Design**: Bright morning-linen layout (`#FAF6F0` / `#F2EAE0`) with warm terracotta accents and a cozy evening walnut transition in the Goodnight section.
- **Framed Interactive 3D Home (`public/models/cangze-residence.glb`)**: Two-column sticky showcase pairing natural room-by-room device controls with live camera movement across rooms plus expandable 3D Free Explore mode.
- **Goodnight Routine & Door Confirmation**: Interactive `"帮我准备睡觉"` walkthrough showing downstairs shutdown, bedroom wind-down, and a polite confirmation pause before locking the front door.
- **Thoughtful Home Helpers & Clear House Rules**: Plain-language helper cards (Nighttime Door Check, Away Energy Saver, Daily Home Energy Note) and family-first safeguards.
- **Everyday Product Showcase & 3-Step Setup**: Real light/dark product screenshots (light mode by default) plus a one-click copy Docker Compose guide for home NAS or mini PC setups.
- **Hosting & CI/CD**: Deployed to Cloudflare Pages Direct Upload (`cangze-website` → <https://cangze.igng.net/>) via `.github/workflows/website.yml`. Full hosting, headers, SEO, and rollback details are in [`docs/HOSTING.md`](./docs/HOSTING.md).

## Development & Scratch Build

Per repository and device rules, run dependency installation, builds, and browser verification inside `$BUILD_SCRATCH_ROOT`:

```bash
scripts/scratch-sync.sh
cd "${BUILD_SCRATCH_ROOT:-$HOME/.build}/cangze/$(basename "$(git rev-parse --show-toplevel)")/website"
pnpm install --frozen-lockfile --ignore-workspace
pnpm run build
pnpm run generate:og
pnpm run build
pnpm run verify
```
