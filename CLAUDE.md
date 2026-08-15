# CLAUDE.md

## Standing rule: data transparency

Every data-backed section added to this app must:

1. Show its source and last-updated date, read from the `data_sources` table - never hardcoded in a component.
2. If the underlying data has known coverage limits (e.g. RÚZ under-representing sole traders who don't file structured accounts), show that limit as a visually prominent banner next to the data itself, not small print.

See `docs/superpowers/specs/2026-08-14-sk-biznis-mapa-data-layer-design.md` for the data layer this app is built on.
