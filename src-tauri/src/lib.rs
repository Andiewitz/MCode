//! MCode application shell.
//!
//! The Rust side owns the native process: windows, filesystem access,
//! processes, and any feature crates wired in from `features/`.
//! The client (`client/`) talks to this code through Tauri IPC (`invoke`).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet, app_version])
        .run(tauri::generate_context!())
        .expect("error while running the MCode application");
}

/// Simple IPC sanity check — remove once real commands exist.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! Welcome to MCode.")
}

/// Expose the running version to the client status bar.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
