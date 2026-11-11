// Search panel backend: substring / whole-word / regex search across the
// project files via the `fs_search` Tauri command (fs-walk in Rust with
// size + result caps). Results are grouped per file in the panel.

import { invoke } from './ipc.js';

export async function searchFiles(rootPath, { query, caseSensitive, wholeWord, useRegex, limit }) {
  return invoke('fs_search', {
    root: rootPath,
    query,
    case_sensitive: caseSensitive,
    whole_word: wholeWord,
    use_regex: useRegex,
    limit: limit ?? 200,
  });
}

// Highlight `query` inside `text` for display, honoring the search options.
// Returns HTML-escaped markup with <mark class="hit"> around matches.
export function highlight(text, query, { caseSensitive, wholeWord, useRegex }) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!query) return esc(text);

  let matcher = null;
  try {
    let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) pattern = `\\b(?:${pattern})\\b`;
    matcher = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    return esc(text);
  }

  let out = '';
  let last = 0;
  let m;
  while ((m = matcher.exec(text)) && out.length < 800) {
    out += esc(text.slice(last, m.index));
    out += `<mark class="hit">${esc(m[0])}</mark>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) matcher.lastIndex++;
  }
  out += esc(text.slice(last));
  return out;
}
