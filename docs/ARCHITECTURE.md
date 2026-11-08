# Architecture

MCode is a lightweight IDE built as a **Tauri v2** desktop app: a Rust core
process hosting a system webview that renders the UI. No Electron, no ballet
of background services — one binary.

## Process model

```
┌────────────────────────────┐
│ Rust core (src-tauri/)     │
│  - window management       │
│  - IPC command handlers    │
│  - feature crates wiring   │
└────────────┬───────────────┘
             │ Tauri IPC (invoke / events)
┌────────────┴───────────────┐
│ Webview client (client/)   │
│  - layout chrome           │
│  - explorer / tabs / editor│
└────────────────────────────┘
```

## Directory map

- `src-tauri/` — app shell. `src/lib.rs` owns the Tauri builder and command
  registry; `capabilities/` declares what IPC the webview may call;
  `tauri.conf.json` configures the window and the embedded frontend.
- `client/` — frontend static assets served straight into the webview
  (`build.frontendDist = "../client"`). No bundler, relies on
  `app.withGlobalTauri = true` for IPC access.
- `features/` — each IDE feature is its own crate (see `features/README.md`).
  The shell in `src-tauri` depends on these crates and exposes their APIs as
  tauri commands. This keeps concerns separable and `src-tauri` slim.
- `tests/` — cross-crate and E2E harnesses. Rust unit tests live with their
  feature crates.
- `dependencies/` — rationale manifest for external dependencies.

## Conventions

- IPC commands: snake_case, defined next to the feature that owns them, then
  registered in `generate_handler![...]` in `src-tauri/src/lib.rs`.
- One crate per feature under `features/`; ui-facing API goes through commands,
  not direct DOM access from Rust.
- Release profile: thin LTO, symbols stripped (see root `Cargo.toml`).

## Known scaffolding TODOs

- Icons: `bundle.icon` is intentionally empty. Generate with
  `cargo tauri icon assets/icon.png` once a logo exists (`tauri build` requires icons).
- Frontend is a placeholder shell (contenteditable editor); the editor feature
  will replace it.
