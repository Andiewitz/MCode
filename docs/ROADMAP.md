# Roadmap

Ordered, intentionally small steps — the IDE earns each feature.

## 0.1 — scaffold (done)

- [x] Tauri v2 app shell, workspace layout, IPC sanity commands
- [x] Feature-crate pattern (`features/editor-core`)

## 0.2 — usable editor

- [ ] File explorer sidebar (fs access via commands)
- [ ] Tabs + open/close/persist state
- [ ] Real editing surface: textarea → single-file buffers → editor-core crate
- [ ] Save / Ctrl-S handling, dirty-state indicator

## 0.3 — polish

- [ ] Syntax highlighting (incremental, per-language crates)
- [ ] Status bar: cursor pos, line ending, encoding
- [ ] Settings file, keybindings map
- [ ] Window icons, `tauri build` bundling

## 0.4 — power features

- [ ] Terminal panel
- [ ] Search across files
- [ ] Command palette
