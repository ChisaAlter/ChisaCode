# Fleurdelys Migration

Fleurdelys keeps old Paseo data readable while new installs and new writes move to the Fleurdelys
names. Do not remove the compatibility paths until a later release explicitly drops
`COMPAT(paseo-name-migration)` support.

## Runtime State

- `FLEURDELYS_HOME` is the canonical home override.
- `PASEO_HOME` remains readable when `FLEURDELYS_HOME` is not set.
- Without either env var, the daemon uses `~/.fleurdelys` unless `~/.paseo` already exists and
  `~/.fleurdelys` does not.
- PID locks are written to `fleurdelys.pid`; readers also check `paseo.pid`.

## Project Config

- `fleurdelys.json` is the canonical project config file.
- `paseo.json` remains readable and writable when it is the only existing config file.
- If both files exist, `fleurdelys.json` wins.
- If neither file exists, new writes create `fleurdelys.json`.

## CLI And Environment

- `fleurdelys` is the primary CLI command.
- `paseo` remains a compatibility alias.
- Server config reads `FLEURDELYS_*` first and falls back to the matching `PASEO_*` env var for
  daemon listen/auth/relay/log/app-base-url/hostnames settings.

## App And Desktop

- The desktop preload exposes `window.fleurdelysDesktop` and keeps `window.paseoDesktop`.
- Electron IPC registers both `fleurdelys:*` and `paseo:*` channels for the supported bridge.
- Packaged desktop content is served through `fleurdelys://`; `paseo://` remains registered.
- Local daemon URLs are emitted as `fleurdelys+local:` and `paseo+local:` is still accepted.
- App settings, host registry, client id, preferred editor, and IndexedDB attachment bytes migrate
  from the old `@paseo:*` / `paseo-*` storage names to Fleurdelys names on read.

## Protocol Compatibility

- New review attachments use `application/fleurdelys-review`; parsers still accept
  `application/paseo-review`.
- New parent-agent labels use `fleurdelys.parent-agent-id`; readers still accept
  `paseo.parent-agent-id`.
- New managed git remotes and auto stashes use `fleurdelys-pr-` and
  `fleurdelys-auto-stash:`; old `paseo-pr-` and `paseo-auto-stash:` remain recognized.
