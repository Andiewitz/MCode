// Explorer sidebar: lazily lists directories over Tauri IPC.
// Dirs expand on click (or Enter/Space); files call back into the editor.
// Rows carry depth-based indent, drawn icons, and ellipsis-truncated labels.
// Git statuses (when provided) tint the label: added green, modified blue.

import { invoke, ipcAvailable } from './ipc.js';
import { chevronDownIcon, folderIcon, fileIcon } from './icons.js';

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function elFromHtml(tag, className, html) {
  const node = el(tag, className);
  node.innerHTML = html;
  return node;
}

const EXT_KIND = {
  ts: 'fi-blue', tsx: 'fi-blue', js: 'fi-blue', jsx: 'fi-blue',
  mjs: 'fi-blue', cjs: 'fi-blue', mts: 'fi-blue', cts: 'fi-blue',
  json: 'fi-amber', jsonc: 'fi-amber', toml: 'fi-amber', ini: 'fi-amber', lock: 'fi-amber',
  rs: 'fi-amber', py: 'fi-green', rb: 'fi-red',
  html: 'fi-p', htm: 'fi-p', xml: 'fi-p', svg: 'fi-p', css: 'fi-p', scss: 'fi-p', less: 'fi-p',
  sh: 'fi-green', bash: 'fi-green', zsh: 'fi-green',
  yml: 'fi-blue', yaml: 'fi-blue',
};

function kindForName(name = '') {
  const ext = name.toLowerCase().includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXT_KIND[ext] || '';
}

function note(text, depth = 0) {
  const node = el('div', 'tree-note', text);
  node.style.setProperty('--depth', String(depth));
  return node;
}

function rowShell({ className, path, depth, label }) {
  const row = el('div', className);
  row.dataset.path = path;
  row.style.setProperty('--depth', String(depth));
  row.setAttribute('role', 'treeitem');
  row.setAttribute('aria-label', label);
  if (className.includes('dir')) {
    row.setAttribute('aria-expanded', 'false');
  }
  row.tabIndex = 0;
  // Keyboard parity with click.
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      row.click();
    }
  });
  return row;
}

function fileNode(entry, onOpen, depth) {
  const row = rowShell({ className: 'tree-node file', path: entry.path, depth, label: entry.name });
  row.appendChild(el('span', 'spacer12'));
  const kind = kindForName(entry.name);
  const icon = elFromHtml('span', `icon${kind ? ` ${kind}` : ''}`, fileIcon);
  row.appendChild(icon);
  row.appendChild(el('span', 'label', entry.name));
  row.addEventListener('click', () => onOpen(entry));
  return row;
}

function dirNode(entry, onOpen, onStatus, depth) {
  const isRoot = depth === 0;
  // The dir is a block container: the clickable row and the nested
  // children list stay out of each other's layout flow.

  const row = rowShell({
    className: `tree-node dir${isRoot ? ' root' : ''}`,
    path: entry.path,
    depth,
    label: entry.name,
  });

  const caret = elFromHtml('span', 'caret', chevronDownIcon);
  row.appendChild(caret);
  const icon = elFromHtml('span', 'icon', folderIcon);
  if (!isRoot) icon.style.color = 'var(--text-dim)';
  row.appendChild(icon);
  row.appendChild(el('span', 'label', entry.name));

  const children = el('div', 'tree-children hidden');
  let loaded = false;

  async function expand() {
    if (!loaded) {
      children.replaceChildren(note('loading…', depth + 1));
      try {
        const entries = await invoke('fs_list_dir', { path: entry.path });
        const nodes = entries.map((child) =>
          child.is_dir
            ? dirNode(child, onOpen, onStatus, depth + 1)
            : fileNode(child, onOpen, depth + 1)
        );
        if (nodes.length === 0) {
          nodes.push(note('empty', depth + 1));
        }
        children.replaceChildren(...nodes);
        loaded = true;
      } catch (err) {
        onStatus(`Could not read ${entry.path}: ${err}`);
        children.replaceChildren();
      }
    }
    children.classList.remove('hidden');
    row.classList.add('expanded');
    row.setAttribute('aria-expanded', 'true');
  }

  function collapse() {
    children.classList.add('hidden');
    row.classList.remove('expanded');
    row.setAttribute('aria-expanded', 'false');
  }

  row.addEventListener('click', () => {
    if (row.classList.contains('expanded')) {
      collapse();
    } else {
      expand();
    }
  });

  const wrapper = el('div', 'tree-entry');
  wrapper.appendChild(row);
  wrapper.appendChild(children);
  return wrapper;
}

/**
 * Fill `rootEl` with a tree rooted at `rootPath` (the active project).
 * Calls `onStatus(message)` on failures, `onOpen(entry)` on file click.
 * Returns `{ setActiveFile(path), setGitStatus(changes), collapseAll() }`.
 */
export async function mountFileTree(rootEl, { rootPath, onOpen, onStatus }) {
  rootEl.replaceChildren();

  if (!ipcAvailable()) {
    rootEl.appendChild(
      note('No Tauri IPC here — run the desktop app to browse files')
    );
    return { setActiveFile() {}, setGitStatus() {}, collapseAll() {} };
  }
  if (!rootPath) {
    rootEl.appendChild(note('No project folder — pick one from Projects'));
    return { setActiveFile() {}, setGitStatus() {}, collapseAll() {} };
  }

  let gitByPath = null; // Map<absolute path, code>

  function applyGitStatus() {
    if (!gitByPath) return;
    rootEl.querySelectorAll('.tree-node.file').forEach((row) => {
      const code = gitByPath.get(row.dataset.path);
      if (code) {
        row.dataset.git = code;
        row.title = `git: ${code}`;
      } else {
        delete row.dataset.git;
        row.removeAttribute('title');
      }
    });
  }

  try {
    const rootName = rootPath.split(/[\\/]/).filter(Boolean).pop() || rootPath;
    const root = dirNode(
      { name: rootName, path: rootPath, is_dir: true },
      onOpen,
      onStatus,
      0
    );
    rootEl.appendChild(root);
    root.querySelector('.tree-node')?.click(); // expand the root on startup
    onStatus(`Ready — ${rootPath}`);
  } catch (err) {
    onStatus(`Explorer failed: ${err}`);
  }

  return {
    setActiveFile(path) {
      rootEl.querySelectorAll('.tree-node.sel').forEach((n) => n.classList.remove('sel'));
      if (!path) return;
      const target = rootEl.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
      if (target) {
        target.classList.add('sel');
        target.scrollIntoView({ block: 'nearest' });
      }
    },
    collapseAll() {
      rootEl.querySelectorAll('.tree-node.expanded').forEach((n) => n.click());
    },
    // changes: [{ code: 'M', path: 'relative/path' }] — matched by suffix
    setGitStatus(changes) {
      gitByPath = null;
      if (changes && changes.length) {
        gitByPath = new Map();
        const rootPrefix = rootEl.querySelector('.tree-node.root')?.dataset.path ?? '';
        for (const change of changes) {
          const abs = `${rootPrefix}/${change.path}`;
          gitByPath.set(abs, change.code);
        }
      }
      applyGitStatus();
    },
  };
}
