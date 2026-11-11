//! file-explorer — directory listing, text file IO, and text search
//! for MCode's explorer and search panels.
//!
//! Bare `std::fs` wrappers with the guards an IDE needs: sizes caps,
//! non-UTF-8 rejection, and directories-sorted-first listings. Used as
//! tauri commands by `src-tauri`.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

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

/// One search match: absolute path, 1-based line/column, and the line text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub column: u32,
    pub text: String,
}

/// Upper bound per file searched (keeps the walk responsive).
pub const MAX_SEARCH_FILE_BYTES: u64 = 1024 * 1024;
/// Upper bound on files visited per search.
pub const MAX_SEARCH_FILES: usize = 20_000;
/// Directories that never contain source worth searching.
const SKIP_DIRS: &[&str] = &[
    ".git", ".hg", ".svn", "node_modules", "target", "dist", "build", "out",
    "vendor", ".venv", "venv", "__pycache__", ".next", ".cache",
];
const MAX_LINE_CHARS: usize = 400;

/// Compile the query into a matcher honoring the search panel options.
/// Literal matching folds ASCII case (offsets stay stable); regex uses
/// the `regex` crate with the same flag, plus `whole_word` wrapping.
fn compile_matcher(
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
) -> Result<Matcher, String> {
    if query.is_empty() {
        return Err("empty search query".to_string());
    }
    if use_regex {
        let pattern = if whole_word {
            format!(r"\b(?:{query})\b")
        } else {
            query.to_string()
        };
        let re = regex::RegexBuilder::new(&pattern)
            .case_insensitive(!case_sensitive)
            .size_limit(10 * (1 << 20))
            .build()
            .map_err(|err| format!("bad regex: {err}"))?;
        Ok(Matcher::Regex(re))
    } else if whole_word {
        let needle = if case_sensitive {
            query.to_string()
        } else {
            query.to_ascii_lowercase()
        };
        Ok(Matcher::LiteralWord { needle, case_sensitive })
    } else {
        let needle = if case_sensitive {
            query.to_string()
        } else {
            query.to_ascii_lowercase()
        };
        Ok(Matcher::Literal { needle, case_sensitive })
    }
}

enum Matcher {
    Literal { needle: String, case_sensitive: bool },
    LiteralWord { needle: String, case_sensitive: bool },
    Regex(regex::Regex),
}

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

impl Matcher {
    /// First match in `line`; returns the 1-based character column.
    fn find(&self, line: &str) -> Option<u32> {
        match self {
            Matcher::Literal { needle, case_sensitive } => {
                let byte_index = if *case_sensitive {
                    line.find(needle)
                } else {
                    find_ascii_ci(line.as_bytes(), needle.as_bytes())
                }?;
                Some(char_column(line, byte_index))
            }
            Matcher::LiteralWord { needle, case_sensitive } => {
                let bytes = line.as_bytes();
                let mut from = 0;
                while let Some(rel) = if *case_sensitive {
                    bytes[from..].windows(needle.len()).position(|w| w == needle.as_bytes())
                } else {
                    find_ascii_ci(&bytes[from..], needle.as_bytes())
                } {
                    let start = from + rel;
                    let end = start + needle.len();
                    let before = start.checked_sub(1).map(|i| bytes[i]).unwrap_or(b' ');
                    let after = bytes.get(end).copied().unwrap_or(b' ');
                    if !is_word_byte(before) && !is_word_byte(after) {
                        return Some(char_column(line, start));
                    }
                    from = start + 1;
                    if from >= bytes.len() {
                        break;
                    }
                }
                None
            }
            Matcher::Regex(re) => {
                let m = re.find(line)?;
                Some(line[..m.start()].chars().count() as u32 + 1)
            }
        }
    }
}

/// ASCII-case-insensitive substring search that preserves byte offsets.
fn find_ascii_ci(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }
    'outer: for start in 0..=(hay.len() - needle.len()) {
        for (i, expected) in needle.iter().enumerate() {
            if !hay[start + i].eq_ignore_ascii_case(expected) {
                continue 'outer;
            }
        }
        return Some(start);
    }
    None
}

/// 1-based column for a byte offset, counting chars (Monaco-style columns).
fn char_column(line: &str, byte_index: usize) -> u32 {
    line.get(..byte_index).map(|s| s.chars().count() as u32).unwrap_or(1) + 1
}

/// Search files under `root` for `query`, respecting the panel options.
/// Walks depth-first with directory skip-lists and size/count caps; one
/// hit per matching line, up to `limit` hits total.
pub fn search_dir(
    root: &str,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
    use_regex: bool,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let matcher = compile_matcher(query, case_sensitive, whole_word, use_regex)?;
    let limit = limit.clamp(1, 500);
    let mut hits = Vec::new();
    let mut stack = vec![PathBuf::from(root)];
    let mut searched = 0usize;

    while let Some(dir) = stack.pop() {
        if hits.len() >= limit {
            break;
        }
        let Ok(items) = fs::read_dir(&dir) else { continue };
        for item in items.flatten() {
            if hits.len() >= limit {
                break;
            }
            let Ok(meta) = item.metadata() else { continue };
            let path = item.path();
            if meta.is_dir() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.starts_with('.') || SKIP_DIRS.iter().any(|skip| name.eq_ignore_ascii_case(skip)) {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if !meta.is_file() || meta.len() > MAX_SEARCH_FILE_BYTES {
                continue;
            }
            searched += 1;
            if searched > MAX_SEARCH_FILES {
                break;
            }
            search_file(&path, &matcher, &mut hits, limit);
        }
    }
    Ok(hits)
}

fn search_file(path: &Path, matcher: &Matcher, hits: &mut Vec<SearchHit>, limit: usize) {
    let Ok(bytes) = fs::read(path) else { return };
    // Binary guard: NUL early in the file means "not ours".
    if bytes[..bytes.len().min(8192)].contains(&0) {
        return;
    }
    let Ok(text) = String::from_utf8(bytes) else { return };
    let path_str = path.to_string_lossy().into_owned();
    for (index, line) in text.lines().enumerate() {
        if hits.len() >= limit {
            return;
        }
        let clean = line.strip_suffix('\r').unwrap_or(line);
        if let Some(column) = matcher.find(clean) {
            let truncated: String = if clean.chars().count() > MAX_LINE_CHARS {
                clean.chars().take(MAX_LINE_CHARS).collect()
            } else {
                clean.to_string()
            };
            hits.push(SearchHit {
                path: path_str.clone(),
                line: index as u32 + 1,
                column,
                text: truncated,
            });
        }
    }
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

    fn hits(dir: &TempDir, query: &str, case_sensitive: bool, whole_word: bool, use_regex: bool) -> Vec<SearchHit> {
        search_dir(dir.path(), query, case_sensitive, whole_word, use_regex, 100).unwrap()
    }

    #[test]
    fn finds_substring_with_columns() {
        let dir = TempDir::new("search");
        fs::write(dir.join("code.rs"), "fn main() {}\nlet alpha = 1;\n").unwrap();
        let found = hits(&dir, "alpha", false, false, false);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 2);
        assert_eq!(found[0].column, 5); // 1-based char column of "alpha"
        assert!(found[0].path.ends_with("code.rs"));
    }

    #[test]
    fn case_option_changes_results() {
        let dir = TempDir::new("case");
        fs::write(dir.join("t.txt"), "Alpha\nalpha\n").unwrap();
        assert_eq!(hits(&dir, "alpha", true, false, false).len(), 1);
        assert_eq!(hits(&dir, "alpha", false, false, false).len(), 2);
    }

    #[test]
    fn whole_word_respects_boundaries() {
        let dir = TempDir::new("word");
        fs::write(dir.join("t.txt"), "main\nmainly\n_main\n").unwrap();
        let found = hits(&dir, "main", true, true, false);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 1);
    }

    #[test]
    fn regex_mode_matches_patterns() {
        let dir = TempDir::new("regex");
        fs::write(dir.join("t.txt"), "foo123\nbar\n").unwrap();
        let found = hits(&dir, r"foo\d+", true, false, true);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 1);
    }

    #[test]
    fn skips_ignored_and_hidden_dirs_and_binaries() {
        let dir = TempDir::new("skip");
        fs::create_dir_all(dir.0.join(".git")).unwrap();
        fs::create_dir_all(dir.0.join("target")).unwrap();
        fs::write(dir.0.join(".git").join("needle.txt"), "needle\n").unwrap();
        fs::write(dir.0.join("target").join("needle.txt"), "needle\n").unwrap();
        fs::write(dir.join("blob.bin"), [0x00, b'n', b'e']).unwrap();
        fs::write(dir.join("ok.txt"), "needle\n").unwrap();

        let found = hits(&dir, "needle", false, false, false);
        assert_eq!(found.len(), 1, "only ok.txt is searched");
        assert!(found[0].path.ends_with("ok.txt"));
    }

    #[test]
    fn respects_limit() {
        let dir = TempDir::new("limit");
        fs::write(dir.join("t.txt"), "hit\nhit\nhit\n").unwrap();
        let found = search_dir(dir.path(), "hit", false, false, false, 2).unwrap();
        assert_eq!(found.len(), 2);
    }

    #[test]
    fn empty_query_and_bad_regex_error_out() {
        let dir = TempDir::new("badquery");
        assert!(search_dir(dir.path(), "", false, false, false, 10).is_err());
        assert!(search_dir(dir.path(), "([", false, false, true, 10).is_err());
    }
}
