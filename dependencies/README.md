# dependencies/

Manifest of external dependencies and how they are pinned. Actual version
resolution lives in `Cargo.lock` / any future `package-lock.json` — this file
documents *why* each dependency exists so they don't quietly accumulate.

## Rust runtime

| Crate        | Version | Why                                        |
| ------------ | ------- | ------------------------------------------ |
| `tauri`      | 2.x     | App shell: window, webview, IPC            |
| `tauri-build`| 2.x     | Build-time codegen (context, permissions)  |
| `serde`      | 1.x     | Serialize IPC command payloads             |
| `serde_json` | 1.x     | JSON payloads over IPC                     |
| `portable-pty` | 0.9   | Native PTY sessions for the terminal panel |
| `regex`      | 1.x     | Pattern search for the Search panel (`fs_search`) |

## Frontend

`client/` is vanilla JS/CSS served into the webview (no bundler) using
`window.__TAURI__` for IPC. Vendored UI deps: Monaco (`client/vendor/monaco`)
and xterm.js (`client/vendor/xterm`). Revisit a bundler only if this outgrows it.

## Tooling

| Tool        | Version | Why                                              |
| ----------- | ------- | ------------------------------------------------ |
| `tauri-cli` | 2.x     | Optional: `cargo tauri dev/build`, icon generation |
| `git`       | 2.x     | Git panel: status, remote, and commit via the CLI    |
