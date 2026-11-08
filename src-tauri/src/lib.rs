//! MCode application shell.
//!
//! The Rust core owns the native process: windows, filesystem access,
//! processes, and any feature crates wired in from `features/`.
//! The client (`client/`) talks to this code through Tauri IPC (`invoke`).

use file_explorer::DirEntry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fs_default_root,
            fs_list_dir,
            fs_read_text_file,
            fs_write_text_file,
            app_version,
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
