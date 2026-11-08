// Tabbed editor: one buffer per tab, alive in memory, shared <textarea>.
// Persisting to disk happens through the save flow (Ctrl/Cmd-S).

import { invoke } from './ipc.js';

export function createEditor({ textarea, tabsBar, onStateChange }) {
  let tabs = [];
  let activeIndex = -1;

  function renderTabs() {
    tabsBar.replaceChildren(
      ...tabs.map((tab, index) => {
        const node = document.createElement('div');
        node.className = `tab${index === activeIndex ? ' active' : ''}`;
        node.title = tab.path;

        const dot = document.createElement('span');
        dot.className = `dot${tab.dirty ? '' : ' hidden'}`;
        node.appendChild(dot);

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = tab.name;
        node.appendChild(label);

        const close = document.createElement('span');
        close.className = 'close';
        close.textContent = '×';
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          closeTab(index);
        });
        node.appendChild(close);

        node.addEventListener('click', () => activate(index));
        return node;
      })
    );
  }

  function activate(index) {
    activeIndex = index;
    textarea.value = tabs[index].text;
    renderTabs();
    onStateChange();
  }

  function openBuffer({ name, path, text }) {
    const existing = tabs.findIndex((tab) => tab.path === path);
    if (existing !== -1) {
      activate(existing); // already open — keep its in-memory buffer
      return;
    }
    tabs.push({ name, path, text, dirty: false });
    activate(tabs.length - 1);
  }

  function closeTab(index) {
    const tab = tabs[index];
    if (tab.dirty && !window.confirm(`Close unsaved “${tab.name}”?`)) {
      return;
    }
    tabs.splice(index, 1);
    if (tabs.length === 0) {
      activeIndex = -1;
      textarea.value = '';
    } else {
      activeIndex = Math.min(index, tabs.length - 1);
      textarea.value = tabs[activeIndex].text;
    }
    renderTabs();
    onStateChange();
  }

  async function save(report) {
    const tab = tabs[activeIndex];
    if (!tab) return;
    if (!tab.path) {
      report?.(`“${tab.name}” has no backing file yet`);
      return;
    }
    if (!tab.dirty) {
      report?.(`${tab.name} already saved`);
      return;
    }
    try {
      await invoke('fs_write_text_file', { path: tab.path, contents: textarea.value });
      tab.text = textarea.value;
      tab.dirty = false;
      renderTabs();
      onStateChange();
      report?.(`Saved ${tab.name}`);
    } catch (err) {
      report?.(`Save failed: ${err}`);
    }
  }

  textarea.addEventListener('input', () => {
    const tab = tabs[activeIndex];
    if (!tab) return;
    if (!tab.dirty) {
      tab.dirty = true;
      renderTabs();
    }
    tab.text = textarea.value;
    onStateChange();
  });

  // Editor nicety: Tab inserts two spaces instead of losing focus.
  // setRangeText does not fire `input`, so dispatch one ourselves.
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  return {
    open: openBuffer,
    save,
    close: closeTab,
    get active() {
      return tabs[activeIndex] ?? null;
    },
  };
}
