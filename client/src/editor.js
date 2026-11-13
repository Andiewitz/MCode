// Tabbed editor backed by Monaco: one model per tab, alive in memory.
// Persisting to disk happens through the save flow (Ctrl/Cmd-S).
// Island look: pill tabs with file-kind icons, gutter bars diffed
// against the last saved snapshot (green = added, blue = modified).
// well this is actully well written looks like someone's a big brain

import { invoke } from './ipc.js';
import { closeIcon, fileIcon } from './icons.js';

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

const EXT_KIND = {
  ts: 'fi-blue', tsx: 'fi-blue', js: 'fi-blue', jsx: 'fi-blue',
  mjs: 'fi-blue', cjs: 'fi-blue', mts: 'fi-blue', cts: 'fi-blue',
  json: 'fi-amber', jsonc: 'fi-amber', toml: 'fi-amber', ini: 'fi-amber',
  rs: 'fi-amber', py: 'fi-green', rb: 'fi-red',
  html: 'fi-p', htm: 'fi-p', xml: 'fi-p', svg: 'fi-p', css: 'fi-p', scss: 'fi-p', less: 'fi-p',
  sh: 'fi-green', bash: 'fi-green', zsh: 'fi-green',
  yml: 'fi-blue', yaml: 'fi-blue', lock: 'fi-amber',
};

function languageForPath(path = '', name = '') {
  const base = (name || path.split(/[\\/]/).pop() || '').toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_LANG[ext] || 'plaintext';
}

function kindForPath(path = '', name = '') {
  const base = (name || path.split(/[\\/]/).pop() || '').toLowerCase();
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_KIND[ext] || '';
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

/* Theme colors follow the design reference: the editor lives on an island. */
const THEMES = {
  dark: {
    base: 'vs-dark',
    colors: {
      'editor.background': '#1e1f22',
      'editor.foreground': '#BCBEC4',
      'editorLineNumber.foreground': '#8A8D94',
      'editorLineNumber.activeForeground': '#BCBEC4',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.selectionBackground': '#22304E',
      'editor.inactiveSelectionBackground': '#1d2637',
      'editorCursor.foreground': '#F2F3F5',
      'editorIndentGuide.background1': '#ffffff0d',
      'editorBracketMatch.background': '#22304E',
      'editorBracketMatch.border': '#2F6BEB',
      'editorWidget.background': '#26282c',
      'editorWidget.border': '#ffffff14',
      'editorSuggestWidget.background': '#26282c',
      'editorHoverWidget.background': '#26282c',
      'input.background': '#26282c',
      'scrollbarSlider.background': '#ffffff14',
      'scrollbarSlider.hoverBackground': '#ffffff1f',
      'scrollbarSlider.activeBackground': '#ffffff29',
      'editorOverviewRuler.border': '#00000000',
    },
    rules: [
      { token: '', foreground: 'BCBEC4' },
      { token: 'keyword', foreground: 'CF8E6D' },
      { token: 'string', foreground: '6AAB73' },
      { token: 'string.escape', foreground: '2AACB8' },
      { token: 'number', foreground: '2AACB8' },
      { token: 'comment', foreground: '858A92', fontStyle: 'italic' },
      { token: 'type', foreground: '56A8F5' },
      { token: 'type.identifier', foreground: '56A8F5' },
      { token: 'function', foreground: '56A8F5' },
      { token: 'identifier', foreground: 'BCBEC4' },
      { token: 'delimiter', foreground: 'BCBEC4' },
      { token: 'operator', foreground: 'BCBEC4' },
      { token: 'tag', foreground: '2AACB8' },
      { token: 'attribute.name', foreground: 'C77DBB' },
      { token: 'attribute.value', foreground: '6AAB73' },
      { token: 'regexp', foreground: '2AACB8' },
    ],
  },
  light: {
    base: 'vs',
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#2B2D30',
      'editorLineNumber.foreground': '#6C707E',
      'editorLineNumber.activeForeground': '#2B2D30',
      'editor.lineHighlightBackground': '#00000009',
      'editor.selectionBackground': '#E2EAFC',
      'editor.inactiveSelectionBackground': '#EEF2FB',
      'editorCursor.foreground': '#0F1012',
      'editorIndentGuide.background1': '#00000012',
      'editorBracketMatch.background': '#E2EAFC',
      'editorBracketMatch.border': '#2F6BEB',
      'editorWidget.background': '#F4F5F7',
      'editorWidget.border': '#00000017',
      'editorSuggestWidget.background': '#F4F5F7',
      'editorHoverWidget.background': '#F4F5F7',
      'input.background': '#F4F5F7',
      'scrollbarSlider.background': '#00000014',
      'scrollbarSlider.hoverBackground': '#0000001f',
      'scrollbarSlider.activeBackground': '#00000029',
      'editorOverviewRuler.border': '#00000000',
    },
    rules: [
      { token: '', foreground: '2B2D30' },
      { token: 'keyword', foreground: '0033B3' },
      { token: 'string', foreground: '067D17' },
      { token: 'string.escape', foreground: '1750EB' },
      { token: 'number', foreground: '1750EB' },
      { token: 'comment', foreground: '6B6E76', fontStyle: 'italic' },
      { token: 'type', foreground: '00627A' },
      { token: 'type.identifier', foreground: '00627A' },
      { token: 'function', foreground: '00627A' },
      { token: 'identifier', foreground: '2B2D30' },
      { token: 'delimiter', foreground: '2B2D30' },
      { token: 'operator', foreground: '2B2D30' },
      { token: 'tag', foreground: '1750EB' },
      { token: 'attribute.name', foreground: '871094' },
      { token: 'attribute.value', foreground: '067D17' },
      { token: 'regexp', foreground: '1750EB' },
    ],
  },
};

THEMES.charcoal = {
  base: 'vs-dark',
  colors: {
    ...THEMES.dark.colors,
    'editor.background': '#191919',
    'editor.foreground': '#C4C4C4',
    'editorLineNumber.foreground': '#8E8E8E',
    'editorLineNumber.activeForeground': '#C4C4C4',
    'editorCursor.foreground': '#F4F4F4',
    'editor.selectionBackground': '#333333',
    'editor.inactiveSelectionBackground': '#2A2A2A',
    'editorBracketMatch.background': '#333333',
    'editorWidget.background': '#222222',
    'editorSuggestWidget.background': '#222222',
    'editorHoverWidget.background': '#222222',
    'input.background': '#222222',
  },
  rules: THEMES.dark.rules,
};

THEMES.midnight = {
  base: 'vs-dark',
  colors: {
    ...THEMES.dark.colors,
    'editor.background': '#0A0F18',
    'editor.foreground': '#C3CBE0',
    'editorLineNumber.foreground': '#7E8AA3',
    'editorLineNumber.activeForeground': '#C3CBE0',
    'editor.lineHighlightBackground': '#A0BEFF0A',
    'editor.selectionBackground': '#1B2A44',
    'editor.inactiveSelectionBackground': '#152034',
    'editorCursor.foreground': '#EEF3FF',
    'editorIndentGuide.background1': '#A0BEFF12',
    'editorBracketMatch.background': '#1B2A44',
    'editorBracketMatch.border': '#79A6FF',
    'editorWidget.background': '#121A28',
    'editorWidget.border': '#A0BEFF1F',
    'editorSuggestWidget.background': '#121A28',
    'editorHoverWidget.background': '#121A28',
    'input.background': '#121A28',
    'scrollbarSlider.background': '#A0BEFF14',
    'scrollbarSlider.hoverBackground': '#A0BEFF1F',
    'scrollbarSlider.activeBackground': '#A0BEFF29',
  },
  rules: [
    { token: '', foreground: 'C3CBE0' },
    { token: 'keyword', foreground: 'D99A7A' },
    { token: 'string', foreground: '7CCF8A' },
    { token: 'string.escape', foreground: '4FC1D4' },
    { token: 'number', foreground: '4FC1D4' },
    { token: 'comment', foreground: '7E8AA3', fontStyle: 'italic' },
    { token: 'type', foreground: '79A6FF' },
    { token: 'type.identifier', foreground: '79A6FF' },
    { token: 'function', foreground: '79A6FF' },
    { token: 'identifier', foreground: 'C3CBE0' },
    { token: 'delimiter', foreground: 'C3CBE0' },
    { token: 'operator', foreground: 'C3CBE0' },
    { token: 'tag', foreground: '4FC1D4' },
    { token: 'attribute.name', foreground: 'D08BDB' },
    { token: 'attribute.value', foreground: '7CCF8A' },
    { token: 'regexp', foreground: '4FC1D4' },
  ],
};

THEMES.warm = {
  base: 'vs',
  colors: {
    ...THEMES.light.colors,
    'editor.background': '#FCF9F3',
    'editor.foreground': '#3B352D',
    'editorLineNumber.foreground': '#7B7265',
    'editorLineNumber.activeForeground': '#3B352D',
    'editor.lineHighlightBackground': '#3C2D1408',
    'editor.selectionBackground': '#E8DECB',
    'editor.inactiveSelectionBackground': '#F0E9DC',
    'editorCursor.foreground': '#1C1813',
    'editorIndentGuide.background1': '#3C2D1412',
    'editorBracketMatch.background': '#E8DECB',
    'editorBracketMatch.border': '#2A5FB0',
    'editorWidget.background': '#F3EEE4',
    'editorWidget.border': '#3C2D1417',
    'editorSuggestWidget.background': '#F3EEE4',
    'editorHoverWidget.background': '#F3EEE4',
    'input.background': '#F3EEE4',
    'scrollbarSlider.background': '#3C2D1414',
    'scrollbarSlider.hoverBackground': '#3C2D141F',
    'scrollbarSlider.activeBackground': '#3C2D1429',
  },
  rules: [
    { token: '', foreground: '3B352D' },
    { token: 'keyword', foreground: '8A4B00' },
    { token: 'string', foreground: '2C7A3F' },
    { token: 'string.escape', foreground: '226B72' },
    { token: 'number', foreground: '226B72' },
    { token: 'comment', foreground: '7B7265', fontStyle: 'italic' },
    { token: 'type', foreground: '2A5FB0' },
    { token: 'type.identifier', foreground: '2A5FB0' },
    { token: 'function', foreground: '2A5FB0' },
    { token: 'identifier', foreground: '3B352D' },
    { token: 'delimiter', foreground: '3B352D' },
    { token: 'operator', foreground: '3B352D' },
    { token: 'tag', foreground: '226B72' },
    { token: 'attribute.name', foreground: '8A3F8F' },
    { token: 'attribute.value', foreground: '2C7A3F' },
    { token: 'regexp', foreground: '226B72' },
  ],
};

const PRETTIER_DARK_RULES = [
  { token: '', foreground: 'E6EDF3' },
  { token: 'keyword', foreground: 'FF7AB2' },
  { token: 'keyword.control', foreground: 'FF7AB2' },
  { token: 'string', foreground: '7EE787' },
  { token: 'string.escape', foreground: 'FFA657' },
  { token: 'number', foreground: 'FFA657' },
  { token: 'constant', foreground: 'FFA657' },
  { token: 'comment', foreground: '8B949E', fontStyle: 'italic' },
  { token: 'type', foreground: '56D4DD' },
  { token: 'type.identifier', foreground: '56D4DD' },
  { token: 'namespace', foreground: '56D4DD' },
  { token: 'function', foreground: '79C0FF' },
  { token: 'identifier', foreground: 'E6EDF3' },
  { token: 'variable', foreground: 'E6EDF3' },
  { token: 'delimiter', foreground: 'E6EDF3' },
  { token: 'operator', foreground: 'FF7AB2' },
  { token: 'tag', foreground: '7EE787' },
  { token: 'attribute.name', foreground: 'D2A8FF' },
  { token: 'attribute.value', foreground: '7EE787' },
  { token: 'regexp', foreground: 'FFA657' },
];
const PRETTIER_LIGHT_RULES = [
  { token: '', foreground: '24292E' },
  { token: 'keyword', foreground: 'D73A49' },
  { token: 'keyword.control', foreground: 'D73A49' },
  { token: 'string', foreground: '22863A' },
  { token: 'string.escape', foreground: 'E36209' },
  { token: 'number', foreground: 'E36209' },
  { token: 'constant', foreground: 'E36209' },
  { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
  { token: 'type', foreground: '6F42C1' },
  { token: 'type.identifier', foreground: '6F42C1' },
  { token: 'namespace', foreground: '6F42C1' },
  { token: 'function', foreground: '005CC5' },
  { token: 'identifier', foreground: '24292E' },
  { token: 'variable', foreground: '24292E' },
  { token: 'delimiter', foreground: '24292E' },
  { token: 'operator', foreground: 'D73A49' },
  { token: 'tag', foreground: '22863A' },
  { token: 'attribute.name', foreground: '6F42C1' },
  { token: 'attribute.value', foreground: '22863A' },
  { token: 'regexp', foreground: 'E36209' },
];

for (const shell of ['dark', 'charcoal', 'midnight']) {
  THEMES[`prettier-${shell}`] = {
    base: 'vs-dark',
    colors: {
      ...THEMES[shell].colors,
      'editorBracketMatch.border': '#FF7AB2',
      'editorCursor.foreground': '#FF7AB2',
    },
    rules: PRETTIER_DARK_RULES,
  };
}
for (const shell of ['light', 'warm']) {
  THEMES[`prettier-${shell}`] = {
    base: 'vs',
    colors: {
      ...THEMES[shell].colors,
      'editorBracketMatch.border': '#D73A49',
      'editorCursor.foreground': '#D73A49',
    },
    rules: PRETTIER_LIGHT_RULES,
  };
}

function defineMcodeTheme(monaco) {
  for (const [name, theme] of Object.entries(THEMES)) {
    monaco.editor.defineTheme(`mcode-${name}`, {
      base: theme.base,
      inherit: true,
      rules: theme.rules,
      colors: theme.colors,
    });
  }
}

/* Gutter diff marks against the last saved snapshot. */
const MARK_CAP = 8000; // skip huge files
const DIFF_CAP = 400; // exact LCS window per side

function computeLineMarks(oldLines, newLines) {
  const marks = [];
  let start = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (start < minLen && oldLines[start] === newLines[start]) start++;
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) {
    endOld--;
    endNew--;
  }
  const o = oldLines.slice(start, endOld);
  const n = newLines.slice(start, endNew);
  if (o.length === 0) {
    for (let i = 0; i < n.length; i++) marks.push({ line: start + i + 1, type: 'add' });
    return marks;
  }
  if (n.length === 0) {
    if (start > 0) marks.push({ line: start, type: 'mod' });
    return marks;
  }
  if (o.length <= DIFF_CAP && n.length <= DIFF_CAP) {
    const m = o.length;
    const k = n.length;
    const dp = new Uint16Array((m + 1) * (k + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = k - 1; j >= 0; j--) {
        dp[i * (k + 1) + j] =
          o[i] === n[j]
            ? dp[(i + 1) * (k + 1) + (j + 1)] + 1
            : Math.max(dp[(i + 1) * (k + 1) + j], dp[i * (k + 1) + (j + 1)]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < k) {
      if (o[i] === n[j]) {
        i++;
        j++;
      } else if (dp[(i + 1) * (k + 1) + j] >= dp[i * (k + 1) + (j + 1)]) {
        marks.push({ line: start + j + 1, type: 'add' });
        j++;
      } else {
        marks.push({ line: start + j + 1, type: 'mod' });
        i++;
        j++;
      }
    }
    while (j < k) {
      marks.push({ line: start + j + 1, type: 'add' });
      j++;
    }
    return marks;
  }
  // region too large for an exact diff — coarse modified band
  for (let idx = 0; idx < n.length; idx++) marks.push({ line: start + idx + 1, type: 'mod' });
  return marks;
}

export async function createEditor({ container, tabsBar, onStateChange, readFile }) {
  const monaco = await loadMonaco();
  defineMcodeTheme(monaco);

  const editor = monaco.editor.create(container, {
    model: null,
    theme: 'mcode-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', monospace",
    fontSize: 13,
    lineHeight: 20,
    tabSize: 2,
    insertSpaces: true,
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    showFoldingControls: 'mouseover',
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
    guides: { indentation: true },
  });

  let tabs = [];
  let activeIndex = -1;
  let cursorCb = null;
  let markersCb = null;

  function tabLabel(tab) {
    return tab.name || tab.path.split(/[\\/]/).pop() || 'untitled';
  }

  function renderTabs() {
    tabsBar.replaceChildren(
      ...tabs.map((tab, index) => {
        const node = document.createElement('div');
        node.className = `tab${index === activeIndex ? ' active' : ''}`;
        node.title = tab.path || tabLabel(tab);
        node.tabIndex = 0;
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
        node.setAttribute('aria-label', tabLabel(tab));

        const icon = document.createElement('span');
        icon.className = `icon ${kindForPath(tab.path, tabLabel(tab))}`.trim();
        icon.innerHTML = fileIcon;
        node.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = tabLabel(tab);
        node.appendChild(label);

        if (tab.dirty) {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.title = 'Unsaved changes';
          node.appendChild(dot);
        } else {
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'tab-close';
          closeBtn.title = `Close ${tabLabel(tab)}`;
          closeBtn.setAttribute('aria-label', `Close ${tabLabel(tab)}`);
          closeBtn.innerHTML = closeIcon;
          closeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            closeTab(index);
          });
          node.appendChild(closeBtn);
        }

        if (index === activeIndex) {
          const underline = document.createElement('span');
          underline.className = 'underline';
          node.appendChild(underline);
        }

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

  function refreshMarks(tab) {
    if (!tab || !tab.model) return;
    const lines = tab.model.getValue().split('\n');
    if (lines.length > MARK_CAP || (tab.savedLines?.length ?? 0) > MARK_CAP) return;
    const marks = computeLineMarks(tab.savedLines ?? [], lines);
    const decorations = marks.map((mk) => ({
      range: new monaco.Range(mk.line, 1, mk.line, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: mk.type === 'add' ? 'gw gw-add' : 'gw gw-mod',
        stickiness: monaco.editor.TrackedRangeStickiness?.NeverGrowsWhenTypingAtEdges ?? 0,
      },
    }));
    tab.model.deltaDecorations(tab.markIds ?? [], decorations);
    tab.markIds = decorations.map((d) => d.id);
  }

  function activate(index) {
    activeIndex = index;
    const tab = tabs[index];
    if (tab) editor.setModel(tab.model);
    renderTabs();
    onStateChange();
  }

  function attachModel(model, { name, path }) {
    const tab = { name, path, dirty: false, savedVersionId: model.getAlternativeVersionId(), model };
    tab.savedLines = model.getValue().split('\n');
    model.onDidChangeContent(() => {
      const nowDirty = model.getAlternativeVersionId() !== tab.savedVersionId;
      if (nowDirty !== tab.dirty) {
        tab.dirty = nowDirty;
        renderTabs();
      }
      onStateChange();
      clearTimeout(tab.markTimer);
      tab.markTimer = setTimeout(() => refreshMarks(tab), 300);
    });
    tabs.push(tab);
    activate(tabs.length - 1);
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
    attachModel(model, { name, path });
  }

  // Reattach a model that was opened before (its buffer still in memory).
  function openModel(model, path) {
    const existing = tabs.findIndex((tab) => tab.model === model);
    if (existing !== -1) return activate(existing);
    attachModel(model, { name: path.split(/[\\/]/).pop(), path });
  }

  function closeTab(index) {
    const tab = tabs[index];
    if (!tab) return;
    if (tab.dirty && !window.confirm(`Close unsaved “${tabLabel(tab)}”?`)) {
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
      report?.(`“${tabLabel(tab)}” has no backing file yet`);
      return;
    }
    if (!tab.dirty) {
      report?.(`${tabLabel(tab)} already saved`);
      return;
    }
    try {
      const contents = tab.model.getValue();
      await invoke('fs_write_text_file', { path: tab.path, contents });
      tab.savedVersionId = tab.model.getAlternativeVersionId();
      tab.dirty = false;
      tab.savedLines = contents.split('\n');
      refreshMarks(tab);
      renderTabs();
      onStateChange();
      report?.(`Saved ${tabLabel(tab)}`);
    } catch (err) {
      report?.(`Save failed: ${err}`);
    }
  }

  // Jump to a location, loading the file if no buffer exists for it.
  async function revealLocation({ path, line, column }) {
    let tab = tabs.find((t) => t.path === path);
    if (!tab) {
      const model = monaco.editor.getModel(monaco.Uri.file(path));
      if (model) {
        openModel(model, path);
      } else {
        if (!readFile) return;
        const text = await readFile(path);
        openBuffer({ name: path.split(/[\\/]/).pop(), path, text });
      }
      tab = tabs.find((t) => t.path === path);
    }
    if (!tab) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: column ?? 1 });
    editor.focus();
  }

  function collectMarkers() {
    const all = monaco.editor.getModelMarkers({});
    const seen = new Set();
    const out = [];
    for (const m of all) {
      if (m.severity < monaco.MarkerSeverity.Info) continue;
      const key = `${m.resource}|${m.startLineNumber}|${m.startColumn}|${m.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const model = monaco.editor.getModel(m.resource);
      const path = model ? model.uri.fsPath : m.resource.fsPath ?? '';
      out.push({
        path,
        name: path.split(/[\\/]/).pop() || path,
        line: m.startLineNumber,
        column: m.startColumn,
        severity: m.severity,
        message: m.message,
      });
    }
    out.sort((a, b) => b.severity - a.severity || a.path.localeCompare(b.path) || a.line - b.line);
    return out;
  }

  let markerTimer = null;
  monaco.editor.onDidChangeMarkers(() => {
    if (!markersCb) return;
    clearTimeout(markerTimer);
    markerTimer = setTimeout(() => markersCb(collectMarkers()), 200);
  });

  editor.onDidChangeCursorPosition((event) => {
    cursorCb?.({
      line: event.position.lineNumber,
      column: event.position.column,
    });
  });

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

  const langNames = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    less: 'Less',
    rust: 'Rust',
    python: 'Python',
    go: 'Go',
    java: 'Java',
    kotlin: 'Kotlin',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    shell: 'Shell',
    yaml: 'YAML',
    ini: 'INI',
    markdown: 'Markdown',
    sql: 'SQL',
    xml: 'XML',
    dockerfile: 'Dockerfile',
    makefile: 'Makefile',
    plaintext: 'Plain Text',
    c: 'C',
    cpp: 'C++',
  };

  return {
    open: openBuffer,
    save,
    close: closeTab,
    revealLocation,
    setTheme(theme) {
      editor.updateOptions({ theme: THEMES[theme] ? `mcode-${theme}` : 'mcode-dark' });
    },
    setFontSize(size) {
      editor.updateOptions({ fontSize: size, lineHeight: Math.round(size * 1.55) });
    },
    setWordWrap(on) {
      editor.updateOptions({ wordWrap: on ? 'on' : 'off' });
    },
    onCursor(cb) {
      cursorCb = cb;
    },
    onMarkers(cb) {
      markersCb = cb;
    },
    activeInfo() {
      const tab = tabs[activeIndex];
      if (!tab || !tab.model) return null;
      const model = tab.model;
      return {
        path: tab.path,
        name: tabLabel(tab),
        dirty: tab.dirty,
        language: langNames[model.getLanguageId()] ?? model.getLanguageId(),
        eol: model.getEOL() === '\r\n' ? 'CRLF' : 'LF',
        spaces: model.getOptions().tabSize,
      };
    },
    get active() {
      return tabs[activeIndex] ?? null;
    },
  };
}
