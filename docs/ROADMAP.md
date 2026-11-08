# Roadmap

Ordered, intentionally small steps — the IDE earns each feature.

## 0.1 — scaffold (done)

- [x] Tauri v2 app shell, workspace layout, IPC sanity commands
- [x] Feature-crate pattern (`features/editor-core`)

## 0.2 — usable editor (current step)

- [x] File explorer: lazy directory listing over IPC, dirs first, case-insensitive
- [x] Tabs: open/close/switch, in-memory buffers, dirty markers
- [x] Editing surface: shared `<textarea>` per buffer (+ Tab → indent)
- [x] Save / Ctrl-S over IPC, dirty-state indicator in tab + status bar
- [ ] Tab/session persistence between app restarts

## 0.3 — polish

- [ ] Syntax highlighting (incremental, per-language crates)
- [ ] Status bar: cursor pos, line ending, encoding
- [ ] Settings file, keybindings map
- [ ] Window icons, `tauri build` bundling

## 0.4 — power features

- [ ] Terminal panel
- [ ] Search across files
- [ ] Command palette
