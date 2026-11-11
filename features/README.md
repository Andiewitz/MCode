# features/

Each subdirectory is one IDE feature, packaged as a small, independent Rust crate.

- `editor-core/` — buffer model and text primitives
- `file-explorer/` — directory listing, text IO, and project search
- `git-panel/` — git status, remote lookup, and commit (git CLI)
- planned: `terminal/`, `syntax/`, `keybindings/`, `lsp-bridge/`, …

Rules of thumb:

- one crate per feature; features only depend on each other explicitly
- unit tests live inside the crate (`#[cfg(test)]` or `crate/tests/`)
- cross-feature and E2E checks go in the repo-root `tests/`
- features get exposed to the UI by wiring tauri commands in `src-tauri/src/lib.rs`
- add the crate to the workspace implicitly via the `features/*` glob in the root `Cargo.toml`
