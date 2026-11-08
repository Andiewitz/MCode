//! file-explorer — directory listing and text file IO for MCode's sidebar.
//!
//! Bare `std::fs` wrappers with the guards an IDE needs: sizes caps,
//! non-UTF-8 rejection, and directories-sorted-first listings. Used as
//! tauri commands by `src-tauri`.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::path::Path;

/// Upper bound for files the client is allowed to open (webview-friendly).
pub const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;

/// One row in the explorer tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug)]
pub enum FsError {
    Io(std::io::Error),
    NotUtf8(String),
    TooLarge { path: String, size: u64 },
}

impl fmt::Display for FsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(err) => write!(f, "filesystem error: {err}"),
            Self::NotUtf8(path) => write!(f, "not UTF-8 text: {path}"),
            Self::TooLarge { path, size } => write!(
                f,
                "file too large to open ({size} bytes > {MAX_TEXT_FILE_BYTES}): {path}"
            ),
        }
    }
}

impl std::error::Error for FsError {}

impl From<std::io::Error> for FsError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// List the immediate children of `path`, directories first, then
/// case-insensitive by name. Unreadable child entries are skipped so one
/// broken symlink can't hide the rest of a directory.
pub fn list_dir(path: &str) -> Result<Vec<DirEntry>, FsError> {
    let mut entries = Vec::new();
    for item in fs::read_dir(path)? {
        let Ok(item) = item else {
            continue;
        };
        let Ok(meta) = item.metadata().or_else(|_| fs::symlink_metadata(item.path())) else {
            continue;
        };
        entries.push(DirEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: item.path().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Read a text file, rejecting non-UTF-8 and oversized content.
pub fn read_text_file(path: &str) -> Result<String, FsError> {
    let path = Path::new(path);
    let size = fs::metadata(path)?.len();
    if size > MAX_TEXT_FILE_BYTES {
        return Err(FsError::TooLarge {
            path: path.to_string_lossy().into_owned(),
            size,
        });
    }
    let bytes = fs::read(path)?;
    String::from_utf8(bytes)
        .map_err(|_| FsError::NotUtf8(path.to_string_lossy().into_owned()))
}

/// Overwrite `path` with `contents` (existing file only — no mkdirs).
pub fn write_text_file(path: &str, contents: &str) -> Result<(), FsError> {
    fs::write(path, contents)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Temp dir that cleans itself up; unique per test name + pid.
    struct TempDir(std::path::PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "mcode-file-explorer-{}-{label}",
                std::process::id()
            ));
            fs::create_dir_all(&dir).expect("create temp dir");
            Self(dir)
        }

        fn path(&self) -> &str {
            self.0.to_str().expect("temp dir path is valid UTF-8")
        }

        fn join(&self, name: &str) -> String {
            self.0.join(name).to_str().unwrap().to_owned()
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_directories_first_then_files_case_insensitive() {
        let dir = TempDir::new("order");
        fs::write(dir.join("beta.txt"), "b").unwrap();
        fs::create_dir(dir.0.join("first")).unwrap();
        fs::write(dir.join("Zeta.txt"), "z").unwrap();
        fs::create_dir(dir.0.join("Alpha")).unwrap();

        let listing = list_dir(dir.path()).unwrap();
        let names: Vec<&str> = listing.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(
            names,
            ["Alpha", "first", "beta.txt", "Zeta.txt"],
            "dirs first, then case-insensitive file sort"
        );
        assert!(listing[0].is_dir && listing[1].is_dir);
        assert!(!listing[2].is_dir);
    }

    #[test]
    fn roundtrips_written_text() {
        let dir = TempDir::new("roundtrip");
        let file = dir.join("note.txt");
        write_text_file(&file, "hello\nworld").unwrap();
        assert_eq!(read_text_file(&file).unwrap(), "hello\nworld");
    }

    #[test]
    fn rejects_non_utf8_files() {
        let dir = TempDir::new("nonutf8");
        let file = dir.join("blob.bin");
        fs::write(&file, [0x68, 0x69, 0xff, 0x6f]).unwrap();
        let err = read_text_file(&file).unwrap_err();
        assert!(matches!(err, FsError::NotUtf8(_)));
    }

    #[test]
    fn rejects_oversized_files() {
        let dir = TempDir::new("oversize");
        let file = dir.join("big.txt");
        fs::write(&file, vec![b'a'; (MAX_TEXT_FILE_BYTES + 1) as usize]).unwrap();
        let err = read_text_file(&file).unwrap_err();
        assert!(matches!(err, FsError::TooLarge { .. }));
    }

    #[test]
    fn errors_on_missing_paths() {
        let dir = TempDir::new("missing");
        assert!(read_text_file(&dir.join("nope.txt")).is_err());
        assert!(list_dir(&dir.join("nope-dir")).is_err());
    }
}
