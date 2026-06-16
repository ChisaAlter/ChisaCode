# Desktop Daemon Spawn

Use this when changing Electron startup, daemon subprocess management, desktop renderer export, window/preload behavior, or desktop-specific environment handling.

## Modules

- `desktop`: Electron main process, preload bridge, windows, daemon spawn, packaging.
- `server`: daemon entrypoint and runtime behavior when spawned by desktop.
- `app`: exported web renderer and Electron platform paths.
- `client`: local WebSocket connection and reconnect behavior.
- `protocol`: handshake and feature contracts used by the renderer.

## Existing Docs

- `docs/development.md`
- `docs/architecture.md`
- `docs/release.md`

## Invariants

- Desktop may manage its own daemon subprocess.
- Electron renderer uses the app web build with `CHISACODE_WEB_PLATFORM=electron`.
- Do not assume a timeout means the daemon must be restarted.
- Windows packaging can emit noisy metadata warnings while still producing usable artifacts.
- The desktop daemon path is not the same as arbitrary dev daemon state.

## Handoff Checklist

1. Separate Electron main/preload changes from renderer UI changes.
2. Check whether the change affects daemon startup, app export, or both.
3. Verify generated desktop artifacts by exit code and artifact existence.
4. Avoid restarting the main daemon unless explicitly approved.
5. Refresh graphs if imports or package dependencies changed.
