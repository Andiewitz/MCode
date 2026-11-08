# MCode

A lightweight IDE built with Rust + Tauri (v2).

## Layout

| Path            | What lives here                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `client/`       | Frontend UI served inside the Tauri webview (vanilla JS/CSS — zero build step for now)             |
| `features/`     | IDE features as small, independent Rust crates (editor core, file explorer, terminal, …)           |
| `src-tauri/`    | Tauri app shell: window management, IPC commands, native integration                               |
| `dependencies/` | Manifest of external dependencies and tooling notes                                               |
| `docs/`         | Architecture notes, decisions, roadmap                                                            |
| `tests/`        | Cross-crate / E2E test harnesses (unit tests live inside each feature crate)                       |

## Getting started

Prerequisites:

- Rust (stable) — the workspace uses edition 2021
- Tauri system libraries, e.g. on Debian/Ubuntu:

  ```sh
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
  ```

Run it (plain cargo, the static frontend gets embedded automatically):

```sh
cargo run -p mcode
```

Optional, for hot-reload dev and bundling:

```sh
cargo install tauri-cli --version "^2"
cargo tauri dev      # dev window with reload
cargo tauri build    # installers / bundles
```

## Tests

```sh
sh tests/run_smoke.sh    # runs `cargo test --workspace` and client checks
```

`Cargo.lock` is committed (application repo).
