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

## Frontend

None for now — `client/` is intentionally vanilla JS/CSS using the
`window.__TAURI__` global API. Revisit (Vite, bundler, `@tauri-apps/api`)
only when the UI outgrows it.

## Tooling

| Tool        | Version | Why                                              |
| ----------- | ------- | ------------------------------------------------ |
| `tauri-cli` | 2.x     | Optional: `cargo tauri dev/build`, icon generation |
