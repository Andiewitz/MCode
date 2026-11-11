// Git panel backend: branch + change list from `git status --porcelain`,
// commit flow via `git add -A` + `git commit`. All through the Tauri
// commands registered in src-tauri (they shell out to the git CLI).

import { invoke } from './ipc.js';

/**
 * Returns `{ branch, changes: [{ code, path }] }` or null when unavailable.
 * Never throws — callers show the empty/error state instead.
 */
export async function fetchGitStatus(rootPath) {
  if (!rootPath) return null;
  try {
    const status = await invoke('git_status', { root: rootPath });
    return status;
  } catch {
    return null;
  }
}

export async function commit(rootPath, message) {
  return invoke('git_commit', { root: rootPath, message });
}
