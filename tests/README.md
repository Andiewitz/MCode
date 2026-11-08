# tests/

Cross-crate and end-to-end test harnesses.

- Unit tests for individual features live **inside** their crates
  (`features/*/src/...`, `#[cfg(test)]`) and run with the workspace.
- This folder hosts orchestrators and E2E checks, expanded as the app grows
  (e.g. Tauri WebDriver for smoke-testing the real window).

Current:

- `run_smoke.sh` — builds the workspace, runs `cargo test --workspace`.
