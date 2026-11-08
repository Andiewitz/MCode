// Explorer sidebar: lazily lists directories over Tauri IPC.
// Dirs expand on click; files call back into the editor.

import { invoke, ipcAvailable } from './ipc.js';

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

function fileNode(entry, onOpen) {
  const row = el('div', 'tree-node file');
  row.dataset.path = entry.path;
  row.appendChild(el('span', 'caret', '·'));
  row.appendChild(el('span', 'label', entry.name));
  row.addEventListener('click', () => onOpen(entry));
  return row;
}

function dirNode(entry, onOpen, onStatus, isRoot) {
  const row = el('div', `tree-node dir${isRoot ? ' root' : ''}`);
  row.dataset.path = entry.path;

  const caret = el('span', 'caret', '▸');
  row.appendChild(caret);
  row.appendChild(el('span', 'label', entry.name));

  const children = el('div', 'tree-children hidden');
  let loaded = false;

  async function expand() {
    if (!loaded) {
      try {
        const entries = await invoke('fs_list_dir', { path: entry.path });
        const nodes = entries.map((child) =>
          child.is_dir
            ? dirNode(child, onOpen, onStatus, false)
            : fileNode(child, onOpen)
        );
        if (nodes.length === 0) {
          nodes.push(el('div', 'tree-loading', 'empty'));
        }
        children.replaceChildren(...nodes);
        loaded = true;
      } catch (err) {
        onStatus(`Could not read ${entry.path}: ${err}`);
      }
    }
    children.classList.remove('hidden');
    caret.textContent = '▾';
    row.classList.add('expanded');
  }

  function collapse() {
    children.classList.add('hidden');
    caret.textContent = '▸';
    row.classList.remove('expanded');
  }

  row.addEventListener('click', () => {
    if (row.classList.contains('expanded')) {
      collapse();
    } else {
      expand();
    }
  });

  row.appendChild(children);
  return row;
}

/**
 * Fill `rootEl` with a tree rooted at the process working directory.
 * Calls `onStatus(message)` on failures, `onOpen(entry)` on file click.
 */
export async function mountFileTree(rootEl, { onOpen, onStatus }) {
  rootEl.replaceChildren();

  if (!ipcAvailable()) {
    rootEl.appendChild(
      el('div', 'tree-loading', 'No Tauri IPC here — run the desktop app to browse files')
    );
    return;
  }

  try {
    const rootPath = await invoke('fs_default_root');
    const rootName = rootPath.split('/').filter(Boolean).pop() || rootPath;
    const root = dirNode(
      { name: rootName, path: rootPath, is_dir: true },
      onOpen,
      onStatus,
      true
    );
    rootEl.appendChild(root);
    root.click(); // expand the root on startup
    onStatus(`Ready — ${rootPath}`);
  } catch (err) {
    onStatus(`Explorer failed: ${err}`);
  }
}
