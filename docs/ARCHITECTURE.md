# MCode Architecture

> Audience: anyone working on MCode, especially if this is your first IDE.
> This document explains how IDEs work, what MCode does today, and the
> architecture MCode should grow into without losing its main advantage:
> it is small, fast, and has no Electron/Node runtime.

---

## 1. How an IDE actually works

A text editor edits text. An IDE is a text editor plus a **model of the
project** and a set of **services** that understand that project.

The core loop is always the same:

```
open project
   │
   ├─ discover files ──────────────► project model
   ├─ read/edit buffers ───────────► editor
   ├─ analyze code ────────────────► diagnostics, completion, navigation
   ├─ run tools ───────────────────► terminal, build, test, debug
   └─ persist state ───────────────► settings, session, recent projects
```

Everything else is UI around that loop.

### 1.1 The four subsystems

| Subsystem | What it owns | Typical implementation |
| --- | --- | --- |
| **Editor** | Buffers, cursors, selections, undo, rendering | Monaco, CodeMirror, or a custom text view |
| **Project model** | Files, folders, ignore rules, open documents, dirty state | File tree + document registry |
| **Language intelligence** | Syntax, completion, diagnostics, go-to-definition, rename | Language Server Protocol (LSP) processes |
| **Tooling** | Terminal, tasks, git, search, debugger, extensions | PTYs, CLIs, DAP, plugin hosts |

A useful mental shortcut: **the editor is a text box with superpowers; the
IDE is the network of services around it.**

### 1.2 Why IDEs are split into frontend and backend

The UI must stay responsive at 60 fps while the machine does slow things:
reading thousands of files, running compilers, spawning language servers,
waiting on git, streaming terminal output.

So IDEs separate:

- **Frontend (UI thread):** rendering, input, layout, local view state.
- **Backend (worker threads/processes):** filesystem, search, git, PTYs,
  language analysis, builds.

Rules that fall out of this:

1. Never do blocking I/O on the UI thread.
2. Never send a huge payload when a small one will do.
3. Every long operation must be cancellable.
4. Slow work should stream results, not return one giant array at the end.

### 1.3 What each "IDE feature" really is

| Feature | Mechanism |
| --- | --- |
| Syntax highlighting | Tokenizer or TextMate grammar in the editor |
| Autocomplete | Language server request at the cursor |
| Go to definition | Language server request returning a file + range |
| Diagnostics | Language server pushes errors/warnings; editor renders markers |
| Project-wide search | Walk files (respecting ignore rules), match, stream hits |
| Git integration | Read `.git`, run `git` CLI, or link libgit2 |
| Terminal | Allocate a PTY, spawn a shell, stream bytes both ways |
| Debugger | Debug Adapter Protocol (DAP) between UI and a debug adapter |
| Extensions | A separate host process or sandbox with a stable API |

### 1.4 Why IDEs get heavy

They accumulate: a full project index at startup, a language server per
language, a webview framework, a Node runtime, telemetry, extension hosts,
and background pollers. Each is reasonable alone; together they cost
gigabytes and seconds of startup.

MCode's bet is the opposite: **do less by default, load on demand, and put
the slow parts in Rust.**

---

## 2. MCode today

MCode is a **Tauri v2** desktop app: one Rust process hosts the operating
system webview and serves a static frontend from `client/`. There is no
Node.js, no bundler, and no frontend framework.

### 2.1 Process model

```
┌──────────────────────────────────────────────────────────────┐
│ mcode (single native process)                                │
│                                                              │
│  ┌────────────────────────┐      ┌─────────────────────────┐ │
│  │ Rust core              │      │ System webview          │ │
│  │ src-tauri/             │◄────►│ client/                 │ │
│  │                        │ IPC  │                         │ │
│  │ • window + lifecycle   │      │ • DOM islands           │ │
│  │ • IPC command handlers │      │ • Monaco editor         │ │
│  │ • feature crate wiring │      │ • xterm.js terminals    │ │
│  │ • PTY session state    │      │ • popovers, layout      │ │
│  └───────────┬────────────┘      └─────────────────────────┘ │
│              │                                                │
│    ┌─────────┼──────────────┬──────────────┐                  │
│    ▼         ▼              ▼              ▼                  │
│  files    git CLI        shells        language              │
│  (std)   (subprocess)   (PTY children)  workers (Monaco)    │
└──────────────────────────────────────────────────────────────┘
```

Properties:

- **One binary.** No sidecar daemon, no local server, no Electron.
- **Static frontend.** `build.frontendDist = "../client"` embeds the files;
  the webview loads them directly.
- **IPC is the only boundary.** The frontend calls `invoke(command, args)`
  and listens to backend events.

### 2.2 Directory map

| Path | Responsibility |
| --- | --- |
| `src-tauri/src/lib.rs` | Tauri builder, command registry, filesystem/git commands, terminal session state |
| `src-tauri/src/main.rs` | Thin entry point |
| `src-tauri/capabilities/` | IPC permissions granted to the webview |
| `src-tauri/tauri.conf.json` | Window, frontend embedding, bundle config |
| `client/index.html` | Static shell: header, rail, islands, popovers |
| `client/src/main.js` | App orchestration: state, popovers, panels, status bar, search, git, run presets |
| `client/src/editor.js` | Monaco setup, themes, tab models, dirty tracking, save, markers |
| `client/src/tree.js` | Lazy file tree (lists a directory only when expanded) |
| `client/src/terminal.js` | Multi-instance terminal manager (tabs, xterm, PTY lifecycle) |
| `client/src/layout.js` | Resizable island layout + persisted sizes |
| `client/src/search.js` | Search IPC wrapper + match highlighting |
| `client/src/git.js` | Git status/commit IPC wrappers |
| `client/src/project-switch.js` | Project-switch ordering (terminals restart before tree rebuild) |
| `client/src/ipc.js` | Thin `window.__TAURI__` wrapper |
| `features/editor-core` | Buffer/text primitives (Rust) |
| `features/file-explorer` | Directory listing, text IO, regex search (Rust) |
| `features/git-panel` | Git status, remote, commit via git CLI (Rust) |
| `redesign-islands/` | Design mockup — reference only, not shipped |
| `tests/` | Smoke + cross-cutting tests |

### 2.3 IPC surface today

Commands (request/response):

| Command | Purpose |
| --- | --- |
| `fs_default_root` | Directory the app was launched from |
| `fs_list_dir` | Immediate children, dirs first |
| `fs_read_text_file` | Read UTF-8 file, capped at 5 MiB |
| `fs_write_text_file` | Save a buffer |
| `fs_search` | Substring/word/regex search, capped at 500 hits |
| `app_version` | Version string |
| `git_status` | Branch, remote, change list |
| `git_commit` | Stage everything + commit |
| `terminal_create` | Spawn a shell in a PTY, returns session id |
| `terminal_write` | Send input bytes |
| `terminal_resize` | Resize the PTY |
| `terminal_kill` | Kill the shell's process group |

Events (backend → frontend streams):

| Event | Payload |
| --- | --- |
| `terminal://data/{id}` | Output chunk for one terminal session |
| `terminal://exit` | `{ id, code }` when a shell exits |

### 2.4 Where state lives

| State | Owner | Persistence |
| --- | --- | --- |
| Open tabs, dirty flags, cursor positions | `editor.js` (Monaco models + tab array) | None yet (session restore is a TODO) |
| File tree expansion | `tree.js` DOM | None |
| Terminal sessions | `terminal.js` + Rust `TerminalState` | None (expected) |
| Theme, editor prefs, shell layout | `main.js` | `localStorage` (`mcode.*`) |
| Recent projects / current project | `main.js` | `localStorage` |
| Git status | `main.js` snapshot | Refetched on demand |
| Search results | `main.js` | In memory |

There is **no central store** today. Modules read and write their own state
and call each other through callbacks. That is fine at this size, but it is
the first thing that will cause bugs as the app grows.

### 2.5 Current flows

**Open a file**

```
tree row click
  → invoke('fs_read_text_file', { path })
  → editor.open({ name, path, text })
  → Monaco model created/reused → tab rendered
```

**Save**

```
Ctrl-S
  → editor reads active model text
  → invoke('fs_write_text_file', { path, contents })
  → dirty flag cleared, status bar updated
```

**Search**

```
query submit
  → invoke('fs_search', { root, query, ... })
  → backend walks directories, returns up to 500 hits
  → frontend renders grouped results
```

**Git**

```
project open / refresh click
  → invoke('git_status', { root })
  → branch + remote + change list rendered
commit
  → invoke('git_commit', { root, message })
  → status refetched
```

**Terminal**

```
+ button / first terminal tab
  → xterm instance + fit addon
  → invoke('terminal_create', { cwd, cols, rows })
  → listen('terminal://data/{id}') → term.write
  → term.onData → invoke('terminal_write')
  → resize observer → invoke('terminal_resize')
```

**Project switch**

```
pick project
  → validate with fs_list_dir
  → rootPath updated + persisted
  → terminal.resetAll(newRoot)   ← shells restarted first
  → mountFileTree(newRoot)
  → git status refreshed
```

### 2.6 Honest assessment

Solid foundations:

- The Rust/webview split is right.
- The feature-crate pattern keeps native logic separable.
- The file tree is already lazy.
- Monaco and xterm are vendored, so the app works offline.
- Terminal sessions have proper process-group cleanup.
- There is a real test seam (`node --test` + Rust unit tests).

Scaffolding that will not scale:

- `main.js` is ~1,500 lines and owns too many unrelated concerns.
- State is scattered across modules and `localStorage`.
- IPC payloads are ad-hoc objects with no shared contract.
- Search is one blocking call returning a capped array — no streaming, no cancel.
- There is no file watcher; the tree can go stale.
- `csp: null` in `tauri.conf.json` is permissive.
- Terminal lives in `lib.rs` instead of a feature crate.
- No LSP, no command registry, no keybinding map, no session restore.
- Monaco is loaded eagerly on startup.

---

## 3. Target architecture

### 3.1 Principles

1. **One process, many threads.** Keep the single-binary model. Use threads
   and child processes for isolation, not a local server.
2. **The webview is a view, not the system.** UI state may live in JS, but
   project truth (files, git, processes) lives in Rust.
3. **Lazy by default.** Nothing is scanned, indexed, loaded, or polled until
   a feature needs it.
4. **Stream, don't batch.** Long operations emit incremental results and
   support cancellation.
5. **Explicit contracts.** Every IPC command/event has a typed payload and a
   stable name.
6. **One source of truth per fact.** A file's content is owned by its buffer;
   git status by the git service; terminal state by its session.
7. **Measure before optimizing.** Budgets in CI, not vibes.

### 3.2 Layers

```
┌───────────────────────────────────────────────────────────────┐
│ UI shell          index.html, islands, popovers, themes        │
├───────────────────────────────────────────────────────────────┤
│ App core          store, commands, keybindings, layout, router │
├───────────────────────────────────────────────────────────────┤
│ Feature clients   editor, explorer, search, git, terminal, …   │
├───────────────────────────────────────────────────────────────┤
│ IPC contract      commands.js / events.js (typed wrappers)     │
├───────────────────────────────────────────────────────────────┤
│ Native services   fs, watcher, search, git, pty, lsp, tasks    │
└───────────────────────────────────────────────────────────────┘
```

Each layer may only talk to the layer directly below it. UI components do
not call `invoke` directly; they dispatch commands through the app core.

### 3.3 Suggested target layout

```
client/src/
  app/
    store.js          # single state object + subscribe/dispatch
    commands.js       # command registry (id, title, run, keybinding)
    keymap.js         # keybinding resolution
    layout.js         # island sizes, panel visibility
  features/
    editor/           # Monaco setup, models, tabs, save
    explorer/         # tree + file operations
    search/           # query UI + result rendering
    git/              # status, changes, commit
    terminal/         # xterm + session tabs
    problems/         # diagnostics list
    settings/         # settings schema + UI
  ui/
    popover.js, list.js, icons.js, statusbar.js
  ipc/
    client.js         # invoke/listen wrappers
    contracts.js      # payload shapes + command names
```

Rust:

```
src-tauri/src/
  commands/           # thin #[tauri::command] wrappers
    fs.rs, git.rs, terminal.rs, search.rs
  services/           # long-lived state and workers
    watcher.rs, search.rs, lsp.rs, tasks.rs
  state.rs            # app-wide managed state
features/             # pure domain crates, no Tauri types
```

`features/*` crates should stay free of Tauri dependencies. Tauri commands
are adapters; the crates are the domain.

### 3.4 State model

Use a **single store** with unidirectional flow:

```
event/input → dispatch(action) → reducer → state → render(selector)
```

- The store holds UI-visible state: open project, tabs, active file, panel
  visibility, theme, search query, git snapshot, terminal metadata.
- Heavy objects stay outside the store: Monaco models, xterm instances,
  DOM nodes. The store holds IDs and lightweight descriptors.
- Persist only what is worth restoring: settings, layout, open tabs (paths +
  cursor), recent projects. Never persist derived data.

### 3.5 Service model

Three interaction shapes:

| Shape | Use for | Example |
| --- | --- | --- |
| **Request/response** | Fast, bounded work | read file, list directory |
| **Stream** | Long work with incremental output | search, terminal output, diagnostics |
| **Session** | Stateful native resource | PTY, language server, watcher |

Every stream gets:

- a **job id**,
- **cancellation** (`cancel_job`),
- **backpressure** (coalesce or drop intermediate events),
- a **terminal event** (`done` or `error`).

Every session gets:

- a **session id**,
- explicit **create/close**,
- a **cleanup path** that runs on project switch and app exit.

### 3.6 File watching

The missing piece that makes an IDE feel alive:

- Add a `notify`-based watcher in Rust, scoped to the open project.
- Debounce bursts (100–250 ms).
- Ignore `.git`, `node_modules`, `target`, build outputs, and binary files.
- Emit a small event: `{ kind: "created" | "changed" | "removed", path }`.
- The frontend updates only the affected tree node and open buffer dirty
  state. Do not re-scan the project.

### 3.7 Language intelligence (LSP)

LSP is how modern IDEs get completion, diagnostics, hover, and navigation
without hard-coding each language.

```
webview (Monaco)
   │  completion / hover / definition requests
   ▼
Rust LSP bridge
   │  JSON-RPC over stdio
   ▼
language server process (rust-analyzer, typescript-language-server, …)
```

Rules:

- One server process per language per project, started **on first use**.
- Run servers as child processes, never in the UI thread.
- Send incremental document changes, not whole files.
- Debounce diagnostics rendering; cap marker counts.
- Kill servers on project switch and app exit.
- Start with **one** language (TypeScript/JavaScript is the easiest win);
  add more only when the bridge is stable.

Do not build a custom parser/indexer unless LSP cannot do the job. That is
how IDEs become heavy.

### 3.8 Extensions

Do not add a Node-based extension host. If extensions are needed:

- Define a small, versioned API (commands, decorations, panels).
- Run extensions in **WASM** (wasmtime) or as **JSON-RPC sidecars**.
- Make the permission model explicit: filesystem scope, network, process
  spawn.
- Load extensions only when a workspace enables them.

Until then, a **command registry** gives most of the extensibility benefit
internally: every action (open file, toggle panel, run task) is a command
with an id, title, and optional keybinding. The command palette is then just
a UI over that registry.

---

## 4. Feature blueprints

### 4.1 Editor and buffers

**Today:** Monaco models per file, tab array, dirty flag, save via IPC.

**Target:**

- One Monaco model per open file, disposed when the tab closes.
- Store tab descriptors (`path`, `dirty`, `cursor`, `scroll`) in app state.
- Restore tabs on startup only if the file still exists.
- Use Monaco's built-in undo stack; never reimplement it.
- Save with an atomic write (`tmp` + rename) in Rust.
- Watch for external changes and prompt before overwriting.
- Load Monaco after first paint, not during startup.

**Lightweight notes:** Monaco is the heaviest frontend dependency. Keep it,
but load only the workers you need and avoid opening files larger than the
5 MiB cap.

### 4.2 Project model and file tree

**Today:** lazy `fs_list_dir` per expanded directory; no watcher.

**Target:**

- Keep the lazy tree.
- Add a watcher (see 3.6) and update nodes in place.
- Respect ignore rules (`.gitignore`, plus IDE defaults) in the backend.
- Add file operations (create, rename, delete) as commands with confirmation.
- Never build a full recursive tree in memory.

### 4.3 Search

**Today:** synchronous walk in a Tauri command, capped at 500 hits.

**Target:**

- Stream hits as they are found (`search://hit/{jobId}`).
- Cancellation when the query changes or the panel closes.
- Prefer `ripgrep` (the crate or the binary) over a hand-written walker.
- Respect ignore rules and binary detection.
- Cap per-file and total results; show "results truncated".
- Keep the query debounced (200–300 ms).

### 4.4 Git

**Today:** `git status --porcelain` and `git commit` via the CLI.

**Target:**

- Keep the CLI (small, correct, no libgit2 build cost).
- Coalesce refresh requests; never poll on a timer.
- Watch `.git/HEAD` and the index for cheap invalidation.
- Add stage/unstage/discard and diff viewing as separate commands.
- Run git operations off the UI thread and surface errors as status, not
  alerts.

### 4.5 Terminal

**Today:** multi-instance xterm + PTY sessions; process-group kill; restart
on project switch.

**Target:**

- Move PTY code into a `features/terminal` crate; keep Tauri commands thin.
- Keep one reader thread per session.
- Add a bounded scrollback buffer (xterm already caps it) and coalesce
  writes into animation frames.
- Track session metadata (cwd, shell, label) in app state.
- Kill the whole process group on close, project switch, and app exit.
- Add "new terminal in this folder" from the tree.

### 4.6 Tasks, run, and debug

**Today:** fixed run presets written into the terminal.

**Target:**

- A task model: name, command, cwd, env, problem matcher.
- Store tasks in `.mcode/tasks.json` (project) and user settings.
- Run tasks in a PTY so output streams and Ctrl-C works.
- Add DAP only after LSP is stable; use the same bridge pattern.

### 4.7 Settings and keybindings

**Today:** `localStorage` objects, hard-coded key handlers.

**Target:**

- Settings file: `~/.config/mcode/settings.json` (user) and
  `.mcode/settings.json` (project, opt-in).
- Schema with defaults; merge layers: defaults → user → project.
- Validate on load; report unknown keys instead of silently ignoring them.
- Keybindings are data: `command id → key chord`, with a default map and
  user overrides.
- One keydown handler resolves the chord and dispatches a command.

### 4.8 Problems and diagnostics

**Today:** Monaco markers aggregated into a list.

**Target:**

- Treat diagnostics as a stream from LSP + task problem matchers.
- Keep a capped list per file; group by severity.
- Clicking a problem opens the file and reveals the range.
- Never block the UI while collecting markers.

---

## 5. The lightweight playbook

### 5.1 Budgets (aspirational, but enforced)

| Metric | Budget |
| --- | --- |
| Window visible | < 500 ms |
| Interactive (typing works) | < 1 s |
| Idle RAM (no project) | < 150 MB |
| Idle RAM (project + editor) | < 300 MB |
| Binary size (release) | < 25 MB |
| Keystroke → paint | < 16 ms |
| Search first results | < 150 ms |
| Terminal echo | < 10 ms |
| File open (1 MB) | < 100 ms |

Measure these on a cold start and after 10 minutes of use. Add a small
benchmark script before optimizing anything.

### 5.2 Rules

1. **No framework runtime unless it earns its bytes.** Vanilla DOM plus a
   tiny store is enough for this UI. If a reactive layer is added, keep it
   under ~10 KB.
2. **Lazy-load heavyweight widgets.** Monaco on first file open; xterm on
   first terminal; language workers on first use.
3. **Never index the whole project at startup.** The tree is lazy; search
   is on demand; git is on demand.
4. **Stream and cancel.** Any operation that can take > 100 ms gets a job id
   and a cancel path.
5. **Coalesce events.** Terminal output, resize, scroll, and git refresh
   should collapse bursts into one render.
6. **Virtualize long lists.** File trees, search results, problems, and
   command palette results should render only visible rows.
7. **Keep IPC payloads small.** Send paths and ranges, not whole file
   contents twice. Avoid base64 for large blobs.
8. **Do CPU work in Rust.** Regex search, file walking, diffing, parsing,
   and hashing belong in the backend.
9. **One long-lived process.** No local HTTP server, no daemon, no Node.
10. **Release memory.** Dispose Monaco models, kill PTYs, drop search jobs,
    clear caches on project switch.
11. **No polling.** Prefer watchers and explicit invalidation. If polling is
    unavoidable, back off and pause when the window is hidden.
12. **Measure in CI.** Track startup time, bundle size, and test count so
    regressions are visible.

### 5.3 Anti-patterns to avoid

- Putting the whole project model in a reactive store and re-rendering it.
- One IPC call per keystroke.
- Returning all search hits in one array after a long walk.
- Loading every language server at startup.
- Re-scanning the file tree after every save.
- Storing file contents in `localStorage`.
- Using `setInterval` for git status or diagnostics.
- Adding a plugin host before there is a command registry.
- Copying VS Code's architecture wholesale. Take the ideas, not the weight.

---

## 6. Data, persistence, and security

### 6.1 Persistence

| Data | Where | Format |
| --- | --- | --- |
| User settings | `~/.config/mcode/settings.json` | JSON |
| Project settings | `.mcode/settings.json` | JSON (opt-in) |
| Session (tabs, layout) | app data dir | JSON |
| Recent projects | app data dir | JSON |
| Secrets | OS keyring | never plain JSON |

Write atomically: write a temp file in the same directory, fsync, rename.
Keep a schema version and migrate on load.

### 6.2 Security

- **CSP:** replace `csp: null` with a strict policy. Monaco may require
  `unsafe-eval` for workers; scope it as narrowly as possible and document
  why.
- **Path scoping:** commands that take a path should validate it against the
  open project root (plus explicit user choices). Do not let a compromised
  renderer read arbitrary files.
- **Capabilities:** keep `capabilities/default.json` minimal. Add
  permissions only when a feature needs them.
- **No remote content:** the webview should load only bundled assets.
- **Process spawning:** only spawn known binaries with explicit arguments;
  never pass unsanitized shell strings.

---

## 7. Testing strategy

| Layer | Tool | What to test |
| --- | --- | --- |
| Domain crates | `cargo test` | Listing, search, git parsing, buffer logic |
| Native services | `cargo test` | Process-group kill, watcher debounce, path guards |
| IPC contract | Rust + JS tests | Payload shapes, error strings, event names |
| Frontend logic | `node --test` | Terminal lifecycle, project switch, store reducers |
| Smoke | `tests/run_smoke.sh` | Assets exist, config parses, tests pass |
| E2E | scripted X11 or WebDriver | Open file, save, switch project, terminal cwd |
| Performance | benchmark script | Startup, search latency, memory |

Keep tests close to the code they test. Prefer behavior over implementation
details. Every bug fix gets a regression test (see the process-group kill
test and the project-switch ordering test).

---

## 8. Evolution plan

### Phase 1 — stabilize the current app

- Extract an app store and command registry from `main.js`.
- Add typed IPC wrappers and a single `contracts` module.
- Move terminal code into `features/terminal`.
- Add the file watcher.
- Move settings/session to JSON files with atomic writes.
- Tighten CSP and path validation.
- Add startup/memory benchmarks.

**Exit:** `main.js` is orchestration only; no module owns unrelated state.

### Phase 2 — language intelligence

- Build the LSP bridge (JSON-RPC over stdio).
- Ship TypeScript/JavaScript first.
- Wire diagnostics, completion, hover, definition.
- Add a problems stream and marker caps.

**Exit:** editing a TS file gives real diagnostics and completion from a
language server, with no startup cost when no TS file is open.

### Phase 3 — workflow

- Command palette over the command registry.
- Data-driven keybindings.
- Task runner with problem matchers.
- Session restore (tabs, layout, cursor).

**Exit:** every action is discoverable and rebindable; reopening the app
restores the workspace.

### Phase 4 — extensions and debugging

- WASM or JSON-RPC extension host with a permission model.
- DAP bridge for one debug adapter.
- Extension marketplace is explicitly out of scope until the API is stable.

**Exit:** a third-party extension can add a command without touching core.

---

## 9. Open questions

- **Reactive layer:** stay vanilla, or add a <10 KB signals library? Decide
  after the store exists.
- **Search engine:** `ripgrep` crate vs `grep-searcher` vs the binary.
- **LSP transport:** stdio is simplest; sockets help with multiple windows.
- **Multi-window:** one project per window, or one process with multiple
  webviews? Start with one window.
- **Remote development:** out of scope until the local model is solid.
- **Plugin API:** wait until the command registry and settings schema are
  stable.

---

## 10. Glossary

| Term | Meaning |
| --- | --- |
| **Buffer** | In-memory text of an open file |
| **Model** | Monaco's document object (text + language + undo) |
| **PTY** | Pseudo-terminal; lets a shell behave as if attached to a terminal |
| **LSP** | Language Server Protocol: JSON-RPC between editor and language server |
| **DAP** | Debug Adapter Protocol: JSON-RPC between IDE and debugger |
| **IPC** | Inter-process communication; here, Tauri `invoke`/events |
| **Job** | A cancellable long-running operation with an id |
| **Session** | A stateful native resource (PTY, language server, watcher) |
| **Command** | A named action with an id, title, and optional keybinding |
| **Workspace** | The open project root and its settings |

---

## 11. References

- Tauri v2: <https://v2.tauri.app/>
- Monaco Editor: <https://microsoft.github.io/monaco-editor/>
- xterm.js: <https://xtermjs.org/>
- Language Server Protocol: <https://microsoft.github.io/language-server-protocol/>
- Debug Adapter Protocol: <https://microsoft.github.io/debug-adapter-protocol/>
- VS Code source (for ideas, not scale): <https://github.com/microsoft/vscode>
