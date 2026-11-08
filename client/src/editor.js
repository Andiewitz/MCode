// Tabbed editor backed by Monaco: one model per tab, alive in memory.
// Persisting to disk happens through the save flow (Ctrl/Cmd-S).
// Tabs are keyboard-reachable (arrow keys move, Enter/Space activates).

import { invoke } from './ipc.js';
import { closeIcon } from './icons.js';

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  rs: 'rust', py: 'python', go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp',
  cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
  md: 'markdown', markdown: 'markdown', sql: 'sql', xml: 'xml', svg: 'xml',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

function languageForPath(path = '', name = '') {
  const base = (name || path.split(/[\\/]/).pop() || '').toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_LANG[ext] || 'plaintext';
}

function loadMonaco() {
  return new Promise((resolve, reject) => {
    if (window.monaco) return resolve(window.monaco);
    if (!window.require?.config || !window.require) {
      return reject(new Error('Monaco loader not available'));
    }
    window.require.config({ paths: { vs: './vendor/monaco/vs' } });
    window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
  });
}

function defineMcodeTheme(monaco) {
  monaco.editor.defineTheme('mcode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#16181d',
      'editorGutter.background': '#16181d',
      'editorLineNumber.foreground': '#5a6270',
      'editorLineNumber.activeForeground': '#b6bcc8',
      'editor.lineHighlightBackground': '#1e2128',
      'editor.selectionBackground': '#26344d',
      'editor.inactiveSelectionBackground': '#1f2838',
      'scrollbarSlider.background': '#32374466',
      'scrollbarSlider.hoverBackground': '#3f455288',
      'scrollbarSlider.activeBackground': '#4f566699',
    },
  });
}

export async function createEditor({ container, tabsBar, onStateChange }) {
  const monaco = await loadMonaco();
  defineMcodeTheme(monaco);

  const editor = monaco.editor.create(container, {
    model: null,
    theme: 'mcode-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', monospace",
    fontSize: 13,
    lineHeight: 22,
    tabSize: 2,
    insertSpaces: true,
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
  });

  let tabs = [];
  let activeIndex = -1;

  function renderTabs() {
    tabsBar.replaceChildren(
      ...tabs.map((tab, index) => {
        const node = document.createElement('div');
        node.className = `tab${index === activeIndex ? ' active' : ''}`;
        node.title = tab.path;
        node.tabIndex = 0;
        node.setAttribute('aria-label', tab.name);

        const dot = document.createElement('span');
        dot.className = `dot${tab.dirty ? '' : ' hidden'}`;
        node.appendChild(dot);

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = tab.name;
        node.appendChild(label);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tab-close';
        closeBtn.title = `Close ${tab.name}`;
        closeBtn.setAttribute('aria-label', `Close ${tab.name}`);
        closeBtn.innerHTML = closeIcon;
        closeBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          closeTab(index);
        });
        node.appendChild(closeBtn);

        node.addEventListener('click', () => activate(index));
        node.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(index);
          }
        });
        return node;
      })
    );
  }

  function activate(index) {
    activeIndex = index;
    const tab = tabs[index];
    if (tab) editor.setModel(tab.model);
    renderTabs();
    editor.focus();
    onStateChange();
  }

  function openBuffer({ name, path, text }) {
    const existing = tabs.findIndex((tab) => tab.path === path);
    if (existing !== -1) {
      activate(existing); // already open — keep its in-memory model
      return;
    }
    const uri = monaco.Uri.file(path || name);
    let model = monaco.editor.getModel(uri);
    const lang = languageForPath(path, name);
    if (model) {
      model.setValue(text);
      monaco.editor.setModelLanguage(model, lang);
    } else {
      model = monaco.editor.createModel(text, lang, uri);
    }
    const tab = { name, path, dirty: false, savedVersionId: model.getAlternativeVersionId(), model };
    model.onDidChangeContent(() => {
      const nowDirty = model.getAlternativeVersionId() !== tab.savedVersionId;
      if (nowDirty !== tab.dirty) {
        tab.dirty = nowDirty;
        renderTabs();
      }
      onStateChange();
    });
    tabs.push(tab);
    activate(tabs.length - 1);
  }

  function closeTab(index) {
    const tab = tabs[index];
    if (!tab) return;
    if (tab.dirty && !window.confirm(`Close unsaved “${tab.name}”?`)) {
      return;
    }
    tabs.splice(index, 1);
    if (tabs.length === 0) {
      activeIndex = -1;
      editor.setModel(null);
    } else {
      activeIndex = Math.min(index, tabs.length - 1);
      editor.setModel(tabs[activeIndex].model);
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
      const contents = tab.model.getValue();
      await invoke('fs_write_text_file', { path: tab.path, contents });
      tab.savedVersionId = tab.model.getAlternativeVersionId();
      tab.dirty = false;
      renderTabs();
      onStateChange();
      report?.(`Saved ${tab.name}`);
    } catch (err) {
      report?.(`Save failed: ${err}`);
    }
  }

  // Arrow keys walk the tab strip without reaching the page.
  tabsBar.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || activeIndex < 0 || tabs.length < 2) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, activeIndex - 1)
        : Math.min(tabs.length - 1, activeIndex + 1);
    if (next !== activeIndex) activate(next);
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
