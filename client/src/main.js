// MCode client entry point: wires sidebar, editor tabs, and the status bar.

import { invoke, ipcAvailable } from './ipc.js';
import { mountFileTree } from './tree.js';
import { createEditor } from './editor.js';

const treeEl = document.getElementById('file-tree');
const tabsEl = document.getElementById('tabs');
const editorEl = document.getElementById('editor');
const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');

let version = '';

function setStatus(message) {
  statusLeft.textContent = message;
}

function updateStatusRight() {
  const parts = [];
  const active = editor.active;
  if (active) {
    parts.push(`${active.path}${active.dirty ? ' •' : ''}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  statusRight.textContent = parts.join('   ');
}

const editor = createEditor({
  textarea: editorEl,
  tabsBar: tabsEl,
  onStateChange: updateStatusRight,
});

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
    editor.save(setStatus);
  }
});

async function init() {
  await mountFileTree(treeEl, { onOpen: openFileFromTree, onStatus: setStatus });

  if (!ipcAvailable()) {
    setStatus('Running outside Tauri — IPC unavailable');
    return;
  }

  try {
    version = await invoke('app_version');
  } catch {
    version = '';
  }
  setStatus('Ready — core connected');
  updateStatusRight();
}

init();
