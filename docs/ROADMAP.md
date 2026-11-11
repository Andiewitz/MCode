# Roadmap

Ordered, intentionally small steps — the IDE earns each feature.

## 0.1 — scaffold (done)

- [x] Tauri v2 app shell, workspace layout, IPC sanity commands
- [x] Feature-crate pattern (`features/editor-core`)

## 0.2 — usable editor (done)

- [x] File explorer: lazy directory listing over IPC, dirs first, case-insensitive
- [x] Tabs: open/close/switch, in-memory buffers, dirty markers
- [x] Editing surface: Monaco (vendored, no build step)
- [x] Save / Ctrl-S over IPC, dirty-state indicator in tab + status bar
- [ ] Tab/session persistence between app restarts

## 0.3 — polish

- [x] Syntax highlighting (Monaco token rules + semantic TS/JSON workers)
- [x] Status bar: breadcrumbs, cursor pos, indent, EOL, language
- [x] "Islands" UI shell from the design reference (window header, left
      rail, floating side/editor/bottom islands, dark + light theme, accent
      picker) — reference: `redesign-islands/Main.dc.html`
- [ ] Settings file, keybindings map
- [x] Window icons (`assets/icon.png` → `scripts/generate-icons.py`)
- [ ] `tauri build` bundling

## 0.4 — power features

- [x] Terminal panel (bottom island, PTY over IPC, run presets)
- [x] Search across files (`fs_search` IPC: substring / whole-word / regex)
- [x] Git panel (`git_status` / `git_commit` IPC via the git CLI; branch
      chip, change list with status colors, commit from the side panel)
- [x] Problems panel (Monaco markers, click to jump)
- [ ] Command palette
