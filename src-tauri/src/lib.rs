//! MCode application shell.
//!
//! The Rust core owns the native process: windows, filesystem access,
//! processes, and any feature crates wired in from `features/`.
//! The client (`client/`) talks to this code through Tauri IPC (`invoke`).

use file_explorer::{DirEntry, SearchHit};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};

struct TermSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<u32, TermSession>>,
    next_id: AtomicU32,
}

#[derive(Serialize, Clone)]
struct TermExit {
    id: u32,
    code: Option<i32>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            fs_default_root,
            fs_list_dir,
            fs_read_text_file,
            fs_write_text_file,
            fs_search,
            app_version,
            git_status,
            git_commit,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the MCode application");
}

/// Default tree root: the directory the IDE was launched from.
#[tauri::command]
fn fs_default_root() -> Result<String, String> {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn fs_list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    file_explorer::list_dir(&path).map_err(|err| err.to_string())
}

#[tauri::command]
fn fs_read_text_file(path: String) -> Result<String, String> {
    file_explorer::read_text_file(&path).map_err(|err| err.to_string())
}

#[tauri::command]
fn fs_write_text_file(path: String, contents: String) -> Result<(), String> {
    file_explorer::write_text_file(&path, &contents).map_err(|err| err.to_string())
}

/// Expose the running version to the client status bar.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn fs_search(
    root: String,
    query: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    use_regex: Option<bool>,
    limit: Option<usize>,
) -> Result<Vec<SearchHit>, String> {
    file_explorer::search_dir(
        &root,
        &query,
        case_sensitive.unwrap_or(false),
        whole_word.unwrap_or(false),
        use_regex.unwrap_or(false),
        limit.unwrap_or(200),
    )
}

#[derive(Serialize, Clone)]
struct GitChange {
    code: String,
    path: String,
}

#[derive(Serialize, Clone)]
struct GitStatus {
    branch: String,
    changes: Vec<GitChange>,
}

fn resolve_root(root: Option<String>) -> Result<String, String> {
    root.filter(|s| !s.trim().is_empty())
        .map(Ok)
        .unwrap_or_else(|| {
            std::env::current_dir()
                .map(|path| path.to_string_lossy().into_owned())
                .map_err(|err| err.to_string())
        })
}

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|err| format!("git unavailable: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("git {} failed", args.first().unwrap_or(&""))
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// `git status --porcelain=v1 -b`, parsed into branch + change rows.
#[tauri::command]
fn git_status(root: Option<String>) -> Result<GitStatus, String> {
    let root = resolve_root(root)?;
    let out = run_git(&root, &["status", "--porcelain=v1", "-b"])?;

    let mut branch = String::new();
    let mut changes = Vec::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            branch = rest.split("...").next().unwrap_or(rest).trim().to_string();
            continue;
        }
        let bytes = line.as_bytes();
        if bytes.len() < 4 {
            continue;
        }
        let raw = &line[..2];
        let code = match raw {
            "??" => "?".to_string(),
            _ => {
                let first = raw.chars().find(|c| !c.is_whitespace()).unwrap_or('M');
                match first {
                    'R' | 'C' => 'M',
                    other => other,
                }
                .to_string()
            }
        };
        let mut path = line[3..].to_string();
        if let Some(rename) = path.rsplit_once(" -> ") {
            path = rename.1.to_string();
        }
        changes.push(GitChange { code, path });
    }
    if branch.is_empty() {
        branch = "(no branch)".to_string();
    }
    Ok(GitStatus { branch, changes })
}

/// Stage everything and commit with `message` (git CLI under the hood).
#[tauri::command]
fn git_commit(root: Option<String>, message: String) -> Result<String, String> {
    let root = resolve_root(root)?;
    let message = message.trim();
    if message.is_empty() {
        return Err("commit message is empty".to_string());
    }
    run_git(&root, &["add", "-A"])?;
    let out = run_git(&root, &["commit", "-m", message])?;
    Ok(out
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("committed")
        .trim()
        .to_string())
}

#[tauri::command]
fn terminal_create(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.cwd(dir);
        }
    } else if let Ok(dir) = std::env::current_dir() {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    state
        .sessions
        .lock()
        .map_err(|_| "terminal state lock poisoned".to_string())?
        .insert(
            id,
            TermSession {
                writer,
                master: pair.master,
                child,
            },
        );

    let app_for_data = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app_for_data.emit(&format!("terminal://data/{id}"), data);
                }
                Err(_) => break,
            }
        }
    });

    let app_for_exit = app.clone();
    let app_handle = app.clone();
    thread::spawn(move || {
        // Poll child exit via state access.
        loop {
            thread::sleep(std::time::Duration::from_millis(120));
            let state = app_handle.state::<TerminalState>();
            let mut guard = match state.sessions.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            if let Some(session) = guard.get_mut(&id) {
                match session.child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.exit_code() as i32;
                        guard.remove(&id);
                        drop(guard);
                        let _ = app_for_exit.emit("terminal://exit", TermExit { id, code: Some(code) });
                        break;
                    }
                    Ok(None) => {}
                    Err(_) => {
                        guard.remove(&id);
                        drop(guard);
                        let _ = app_for_exit.emit("terminal://exit", TermExit { id, code: None });
                        break;
                    }
                }
            } else {
                break;
            }
        }
    });

    Ok(id)
}

#[tauri::command]
fn terminal_write(state: State<'_, TerminalState>, id: u32, data: String) -> Result<(), String> {
    let mut guard = state
        .sessions
        .lock()
        .map_err(|_| "terminal state lock poisoned".to_string())?;
    let session = guard.get_mut(&id).ok_or("terminal session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, TerminalState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let guard = state
        .sessions
        .lock()
        .map_err(|_| "terminal state lock poisoned".to_string())?;
    let session = guard.get(&id).ok_or("terminal session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn terminal_kill(state: State<'_, TerminalState>, id: u32) -> Result<(), String> {
    let mut guard = state
        .sessions
        .lock()
        .map_err(|_| "terminal state lock poisoned".to_string())?;
    if let Some(mut session) = guard.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}
