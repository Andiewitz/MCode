// MCode client entry point: wires layout, sidebar, editor tabs, terminal, status bar.

import { invoke, ipcAvailable } from './ipc.js';
import { mountFileTree } from './tree.js';
import { createEditor } from './editor.js';
import { createTerminal } from './terminal.js';
import { initLayout } from './layout.js';
import { panelIcon, explorerIcon, terminalIcon } from './icons.js';

const appEl = document.getElementById('app');
const treeEl = document.getElementById('file-tree');
const tabsEl = document.getElementById('tabs');
const editorEl = document.getElementById('editor');
const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');
const sidebarToggleEl = document.getElementById('sidebar-toggle');
const splitGripEl = document.getElementById('split-grip');
const viewExplorerBtn = document.getElementById('view-explorer');
const viewTerminalBtn = document.getElementById('view-terminal');
const explorerView = document.getElementById('explorer-view');
const terminalView = document.getElementById('terminal-view');
const terminalHost = document.getElementById('terminal-host');

let version = '';
let tree = null;
let editor = null;
let terminal = null;
let rootPath = null;
let activeSideView = 'explorer';

function setStatus(message) {
  statusLeft.textContent = message;
}

function updateStatusRight() {
  const parts = [];
  const active = editor?.active;
  if (active) {
    parts.push(`${active.path}${active.dirty ? ' •' : ''}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  statusRight.textContent = parts.join('   ');
  tree?.setActiveFile(active?.path ?? null);
}

initLayout({ app: appEl, grip: splitGripEl, toggle: sidebarToggleEl });
sidebarToggleEl.innerHTML = panelIcon;
if (viewExplorerBtn) viewExplorerBtn.innerHTML = explorerIcon;
if (viewTerminalBtn) viewTerminalBtn.innerHTML = terminalIcon;

async function showSideView(name) {
  activeSideView = name;
  explorerView?.classList.toggle('hidden', name !== 'explorer');
  terminalView?.classList.toggle('hidden', name !== 'terminal');
  viewExplorerBtn?.classList.toggle('active', name === 'explorer');
  viewTerminalBtn?.classList.toggle('active', name === 'terminal');
  if (name === 'terminal' && terminal) {
    await terminal.show(rootPath);
  }
}

viewExplorerBtn?.addEventListener('click', () => showSideView('explorer'));
viewTerminalBtn?.addEventListener('click', () => showSideView('terminal'));

async function openFileFromTree(entry) {
  try {
    const text = await invoke('fs_read_text_file', { path: entry.path });
    editor.open({ name: entry.name, path: entry.path, text });
  } catch (err) {
    setStatus(`Could not open ${entry.name}: ${err}`);
  }
}

// Global save shortcut.
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    editor?.save(setStatus);
  }
  if ((event.ctrlKey || event.metaKey) && event.key === '`') {
    event.preventDefault();
    showSideView(activeSideView === 'terminal' ? 'explorer' : 'terminal');
  }
});

async function init() {
  try {
    editor = await createEditor({
      container: editorEl,
      tabsBar: tabsEl,
      onStateChange: updateStatusRight,
    });
  } catch (err) {
    setStatus(`Editor failed to load: ${err}`);
    return;
  }

  terminal = createTerminal({ host: terminalHost, onStatus: setStatus });
  tree = await mountFileTree(treeEl, { onOpen: openFileFromTree, onStatus: setStatus });

  if (!ipcAvailable()) {
    setStatus('Running outside Tauri — IPC unavailable');
    return;
  }

  try {
    version = await invoke('app_version');
  } catch {
    version = '';
  }
  try {
    rootPath = await invoke('fs_default_root');
  } catch {
    rootPath = null;
  }
  setStatus('Ready — core connected');
  updateStatusRight();
}

init();
