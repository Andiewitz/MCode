//! git-panel — git status, remote lookup, and commit for MCode's Git panel.
//!
//! Wraps the `git` CLI instead of linking libgit2: branch, origin URL,
//! porcelain change list, and stage-all + commit. Used as Tauri commands
//! by `src-tauri`.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::process::Command;

/// One row in the Git panel's change list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitChange {
    /// Single-letter porcelain code (`?`, `M`, `A`, `D`, …). Renames and
    /// copies are folded into `M`.
    pub code: String,
    /// Path relative to the repository root.
    pub path: String,
}

/// Branch, remote, and working-tree changes for a repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    /// URL of `origin`, or of the first configured remote.
    pub remote: Option<String>,
    pub changes: Vec<GitChange>,
}

#[derive(Debug)]
pub enum GitError {
    Io(std::io::Error),
    Command { args: String, stderr: String },
    EmptyMessage,
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(err) => write!(f, "git unavailable: {err}"),
            Self::Command { args, stderr } => {
                if stderr.is_empty() {
                    write!(f, "git {args} failed")
                } else {
                    write!(f, "{stderr}")
                }
            }
            Self::EmptyMessage => write!(f, "commit message is empty"),
        }
    }
}

impl std::error::Error for GitError {}

impl From<std::io::Error> for GitError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// Use `root` when provided, else the process working directory.
pub fn resolve_root(root: Option<&str>) -> Result<String, GitError> {
    if let Some(root) = root.map(str::trim).filter(|root| !root.is_empty()) {
        return Ok(root.to_string());
    }
    std::env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(GitError::Io)
}

fn run_git(root: &str, args: &[&str]) -> Result<String, GitError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(GitError::Command {
            args: args.join(" "),
            stderr,
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// URL of `origin`, or of the first configured remote when origin is absent.
pub fn remote(root: &str) -> Option<String> {
    let out = run_git(root, &["remote", "-v"]).ok()?;
    let mut fallback = None;
    for line in out.lines() {
        let mut parts = line.split_whitespace();
        let (Some(name), Some(url)) = (parts.next(), parts.next()) else {
            continue;
        };
        if name == "origin" {
            return Some(url.to_string());
        }
        fallback.get_or_insert_with(|| url.to_string());
    }
    fallback
}

/// `git status --porcelain=v1 -b`, parsed into branch + change rows.
pub fn status(root: Option<&str>) -> Result<GitStatus, GitError> {
    let root = resolve_root(root)?;
    let out = run_git(&root, &["status", "--porcelain=v1", "-b"])?;

    let mut branch = String::new();
    let mut changes = Vec::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            let rest = rest.split("...").next().unwrap_or(rest).trim();
            // Fresh repositories report "No commits yet on <branch>".
            branch = rest
                .strip_prefix("No commits yet on ")
                .unwrap_or(rest)
                .to_string();
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
    Ok(GitStatus {
        branch,
        remote: remote(&root),
        changes,
    })
}

/// Stage everything and commit with `message` (git CLI under the hood).
pub fn commit(root: Option<&str>, message: &str) -> Result<String, GitError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(GitError::EmptyMessage);
    }
    let root = resolve_root(root)?;
    run_git(&root, &["add", "-A"])?;
    let out = run_git(&root, &["commit", "-m", message])?;
    Ok(out
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("committed")
        .trim()
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    /// Temporary repository with a deterministic identity, cleaned on drop.
    struct TempRepo(PathBuf);

    impl TempRepo {
        fn new(label: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "mcode-git-panel-{}-{label}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).expect("create temp repo");
            let repo = Self(dir);
            repo.git(&["init", "-q", "-b", "main"]);
            repo.git(&["config", "user.email", "test@example.com"]);
            repo.git(&["config", "user.name", "MCode Test"]);
            repo.git(&["config", "commit.gpgsign", "false"]);
            repo
        }

        fn path(&self) -> &str {
            self.0.to_str().expect("temp repo path is valid UTF-8")
        }

        fn write(&self, name: &str, contents: &str) {
            fs::write(self.0.join(name), contents).expect("write test file");
        }

        fn git(&self, args: &[&str]) -> String {
            let out = Command::new("git")
                .args(args)
                .current_dir(&self.0)
                .output()
                .expect("run git");
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            String::from_utf8_lossy(&out.stdout).into_owned()
        }
    }

    impl Drop for TempRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn status_reports_branch_and_untracked_changes() {
        let repo = TempRepo::new("status");
        repo.write("main.rs", "fn main() {}\n");

        let status = status(Some(repo.path())).unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.remote, None);
        assert_eq!(status.changes.len(), 1);
        assert_eq!(status.changes[0].code, "?");
        assert_eq!(status.changes[0].path, "main.rs");
    }

    #[test]
    fn status_prefers_origin_and_falls_back_to_first_remote() {
        let repo = TempRepo::new("remote");
        repo.git(&["remote", "add", "upstream", "https://example.com/upstream.git"]);
        repo.git(&["remote", "add", "origin", "https://example.com/origin.git"]);

        let with_origin = status(Some(repo.path())).unwrap();
        assert_eq!(
            with_origin.remote.as_deref(),
            Some("https://example.com/origin.git")
        );

        repo.git(&["remote", "remove", "origin"]);
        let fallback = status(Some(repo.path())).unwrap();
        assert_eq!(
            fallback.remote.as_deref(),
            Some("https://example.com/upstream.git")
        );
    }

    #[test]
    fn status_folds_renames_into_modified_rows() {
        let repo = TempRepo::new("rename");
        repo.write("old.txt", "same\n");
        repo.git(&["add", "-A"]);
        repo.git(&["commit", "-q", "-m", "seed"]);
        repo.git(&["mv", "old.txt", "new.txt"]);

        let status = status(Some(repo.path())).unwrap();
        assert_eq!(status.changes.len(), 1);
        assert_eq!(status.changes[0].code, "M");
        assert_eq!(status.changes[0].path, "new.txt");
    }

    #[test]
    fn commit_stages_everything_and_clears_status() {
        let repo = TempRepo::new("commit");
        repo.write("note.txt", "hello\n");

        let summary = commit(Some(repo.path()), "  initial commit  ").unwrap();
        assert!(summary.contains("initial commit"), "unexpected summary: {summary}");

        let status = status(Some(repo.path())).unwrap();
        assert!(status.changes.is_empty());
        let log = repo.git(&["log", "-1", "--pretty=%s"]);
        assert_eq!(log.trim(), "initial commit");
    }

    #[test]
    fn commit_rejects_empty_message() {
        let repo = TempRepo::new("empty-message");
        repo.write("note.txt", "hello\n");

        let err = commit(Some(repo.path()), "   ").unwrap_err();
        assert!(matches!(err, GitError::EmptyMessage));
    }

    #[test]
    fn status_errors_outside_a_repository() {
        let dir = std::env::temp_dir().join(format!(
            "mcode-git-panel-{}-norepo",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let result = status(Some(dir.to_str().unwrap()));
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
