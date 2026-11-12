// MCode client entry: wires the islands shell together — window header,
// left rail, side views (files/search/git/run/plugins), the editor island,
// the bottom island (terminal/problems/output), the status bar, and the
// theme system (multiple themes + accent) from the design reference.

import { invoke, ipcAvailable } from './ipc.js';
import { mountFileTree } from './tree.js';
import { createEditor } from './editor.js';
import { createTerminal } from './terminal.js';
import { initLayout } from './layout.js';
import { fetchGitStatus, commit } from './git.js';
import { searchFiles, highlight } from './search.js';
import {
  menuIcon, searchIcon, gitIcon, playIcon, pluginsIcon, terminalIcon,
  problemsIcon, settingsIcon, chevronDownIcon, refreshIcon, plusIcon,
  closeIcon, errorIcon, warningIcon, infoIcon, clockIcon, filePlusIcon,
  collapseIcon, playIcon as runPlay, folderIcon, githubIcon,
} from './icons.js';

/* --- element refs ---------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const appEl = $('app');
const menuBtn = $('menu-btn');
const menuPop = $('menu-pop');
const settingsBtn = $('tool-settings');
const settingsPop = $('settings-pop');
const projectChip = $('project-chip');
const projectName = $('project-name');
const branchChip = $('branch-chip');
const branchName = $('branch-name');
const runChip = $('run-chip');
const headerSearchBtn = $('header-search-btn');
const remoteChip = $('remote-chip');
const remoteLabel = $('remote-label');
const projectsPop = $('projects-pop');

const railBtns = {
  files: $('tool-files'),
  search: $('tool-search'),
  git: $('tool-git'),
  run: $('tool-run'),
  plugins: $('tool-plugins'),
};
const railBottomBtns = { terminal: $('tool-terminal'), problems: $('tool-problems') };
const sideViews = {
  files: $('view-files'),
  search: $('view-search'),
  git: $('view-git'),
  run: $('view-run'),
  plugins: $('view-plugins'),
};
const sideGrip = $('side-grip');
const bottomGrip = $('bottom-grip');

const tabsEl = $('tabs');
const editorEl = $('editor');
const treeEl = $('file-tree');
const terminalHost = $('terminal-host');

const bottomTabBtns = {
  terminal: $('tab-terminal'),
  problems: $('tab-problems'),
  output: $('tab-output'),
};
const bottomViews = {
  terminal: $('terminal-view'),
  problems: $('problems-view'),
  output: $('output-view'),
};
const probCount = $('prob-count');
const probDot = $('prob-dot');
const gitDot = $('git-dot');
const outDot = $('out-dot');
const outputLog = $('output-log');
const problemsList = $('problems-list');
const terminalNewBtn = $('terminal-new');
const bottomCloseBtn = $('bottom-close');

const searchInput = $('search-input');
const searchResults = $('search-results');
const searchRecentWrap = $('search-recent-wrap');
const searchRecent = $('search-recent');
const searchChips = {
  case: $('search-case'),
  word: $('search-word'),
  regex: $('search-regex'),
};
const searchClearBtn = $('search-clear');

const commitMsg = $('commit-msg');
const commitBtn = $('commit-btn');
const commitError = $('commit-error');
const gitChanges = $('git-changes');
const gitRefreshBtn = $('git-refresh');

const runList = $('run-list');
const runAddBtn = $('run-add');
const pluginList = $('plugin-list');

const breadcrumbs = $('breadcrumbs');
const sbPos = $('sb-pos');
const sbSpaces = $('sb-spaces');
const sbEol = $('sb-eol');
const sbLang = $('sb-lang');

/* --- state ------------------------------------------------------------ */

const SHELL_KEY = 'mcode.shell';
const THEME_KEY = 'mcode.theme';
const SEARCH_KEY = 'mcode.search';
const PROJECT_KEY = 'mcode.project';
const PROJECTS_KEY = 'mcode.projects';
const ACCENTS = ['#2F6BEB', '#7C5CFF', '#E5731F', '#1FA37A'];
const LIGHT_THEMES = new Set(['light', 'warm']);
const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark', frame: '#2c2e32', island: '#1e1f22' },
  { id: 'light', label: 'Light', frame: '#e4e6eb', island: '#ffffff' },
  { id: 'charcoal', label: 'Charcoal', frame: '#262626', island: '#191919' },
  { id: 'midnight', label: 'Midnight', frame: '#0d1420', island: '#0a0f18' },
  { id: 'warm', label: 'Warm', frame: '#e7e1d6', island: '#fcf9f3' },
];
const EDITOR_THEME_OPTIONS = [
  { id: 'auto', label: 'Match shell' },
  { id: 'prettier', label: 'Prettier' },
];

let version = '';
let rootPath = null;
let rootName = '';
let tree = null;
let editor = null;
let terminal = null;
let layout = null;
let gitInfo = null;
let problemList = [];

let theme = { theme: 'dark', accent: '#2F6BEB', editorTheme: 'auto' };
let searchOpts = { case: false, word: false, regex: false };
let recentSearches = [];
let sideTool = 'files'; // '' = side island closed
let bottomTab = 'terminal'; // '' = bottom island closed
let gitTimer = null;
let recentProjects = [];
let committing = false;
let commitFlash = false;
let commitSuccessTimer = null;

function readJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '');
    if (raw && typeof raw === 'object') return { ...fallback, ...raw };
  } catch {
    // fall through
  }
  return { ...fallback };
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — session-only state
  }
}

/* --- output log -------------------------------------------------------- */

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logOutput(text, kind = '') {
  const line = document.createElement('div');
  line.className = `tl${kind ? ` ${kind}` : ''}`;
  line.textContent = `[${stamp()}] ${text}`;
  const stick = outputLog.scrollTop + outputLog.clientHeight >= outputLog.scrollHeight - 24;
  outputLog.appendChild(line);
  if (stick) outputLog.scrollTop = outputLog.scrollHeight;
  if (bottomTab !== 'output') outDot.classList.remove('hidden');
}

function setStatus(message) {
  logOutput(message);
}

/* --- theme -------------------------------------------------------------- */

let themeSwitchFrame = 0;

function applyTheme() {
  // Theme changes swap many CSS variables at once. Disable transitions for a
  // frame so every control snaps to the new palette together instead of
  // animating through a muddy, flickering in-between state.
  document.body.classList.add('theme-switching');
  document.body.dataset.theme = theme.theme;
  document.body.style.setProperty('--accent', theme.accent);
  document.querySelector('meta[name="color-scheme"]').content = LIGHT_THEMES.has(theme.theme)
    ? 'light'
    : 'dark';
  terminal?.setTheme(theme.theme);
  const editorTheme = theme.editorTheme === 'prettier' ? `prettier-${theme.theme}` : theme.theme;
  editor?.setTheme(editorTheme);
  syncSettings();
  cancelAnimationFrame(themeSwitchFrame);
  themeSwitchFrame = requestAnimationFrame(() => {
    themeSwitchFrame = requestAnimationFrame(() => document.body.classList.remove('theme-switching'));
  });
}

function loadTheme() {
  theme = readJson(THEME_KEY, theme);
  if (!THEME_OPTIONS.some((opt) => opt.id === theme.theme)) theme.theme = 'dark';
  if (!EDITOR_THEME_OPTIONS.some((opt) => opt.id === theme.editorTheme)) theme.editorTheme = 'auto';
}

/* --- menu popover -------------------------------------------------------- */

function renderMenu() {
  menuPop.replaceChildren(
    menuRow('Settings', () => openSettings(settingsBtn)),
    elSpan('menu-note', `MCode ${version ? `v${version}` : ''}`.trim()),
    menuRow('Reload UI', () => location.reload())
  );
}

/* --- settings popover ---------------------------------------------------- */

function renderSettings() {
  const head = document.createElement('div');
  head.className = 'settings-head';
  const title = elSpan('settings-title', 'Settings');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'settings-close';
  close.setAttribute('aria-label', 'Close settings');
  close.innerHTML = closeIcon;
  close.addEventListener('click', closeSettings);
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'settings-body';
  body.append(
    elSpan('lbl', 'Shell theme'),
    themeGrid(),
    elSpan('lbl', 'Accent'),
    swatchRow(),
    elSpan('lbl', 'Editor theme'),
    editorThemeGrid()
  );
  settingsPop.replaceChildren(head, body);
}

const AUTO_PREVIEW = {
  dark: { k: '#cf8e6d', s: '#6aab73', n: '#2aacb8', f: '#56a8f5' },
  charcoal: { k: '#cf8e6d', s: '#6aab73', n: '#2aacb8', f: '#56a8f5' },
  midnight: { k: '#d99a7a', s: '#7ccf8a', n: '#4fc1d4', f: '#79a6ff' },
  light: { k: '#0033b3', s: '#067d17', n: '#1750eb', f: '#00627a' },
  warm: { k: '#8a4b00', s: '#2c7a3f', n: '#226b72', f: '#2a5fb0' },
};
const PRETTIER_PREVIEW = {
  dark: { k: '#ff7ab2', s: '#7ee787', n: '#ffa657', f: '#79c0ff' },
  light: { k: '#d73a49', s: '#22863a', n: '#e36209', f: '#005cc5' },
};

function editorThemeGrid() {
  const wrap = document.createElement('div');
  wrap.className = 'editor-themes';
  const light = LIGHT_THEMES.has(theme.theme);
  const shell = THEME_OPTIONS.find((opt) => opt.id === theme.theme) ?? THEME_OPTIONS[0];
  for (const opt of EDITOR_THEME_OPTIONS) {
    const colors = opt.id === 'prettier'
      ? PRETTIER_PREVIEW[light ? 'light' : 'dark']
      : AUTO_PREVIEW[theme.theme] ?? AUTO_PREVIEW.dark;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `editor-theme-btn${theme.editorTheme === opt.id ? ' on' : ''}`;
    btn.dataset.editorTheme = opt.id;
    btn.setAttribute('aria-pressed', theme.editorTheme === opt.id ? 'true' : 'false');

    const preview = document.createElement('span');
    preview.className = 'editor-preview';
    preview.style.background = shell.island;
    const tok = (cls, text, color) => {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      span.style.color = color;
      return span;
    };
    preview.append(
      tok('tok-k', 'const', colors.k),
      tok('tok-f', 'x', colors.f),
      tok('tok-op', '=', colors.k),
      tok('tok-n', '42', colors.n),
      tok('tok-s', '"hi"', colors.s)
    );

    const text = document.createElement('span');
    text.className = 'editor-theme-text';
    const name = elSpan('editor-theme-name', opt.label);
    const note = elSpan(
      'editor-theme-note',
      opt.id === 'prettier' ? 'Brighter, high-contrast syntax' : `Follows ${shell.label}`
    );
    text.append(name, note);

    btn.append(preview, text);
    btn.addEventListener('click', () => {
      theme.editorTheme = opt.id;
      persist(THEME_KEY, theme);
      applyTheme();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function syncSettings() {
  if (settingsPop.classList.contains('hidden')) return;
  const light = LIGHT_THEMES.has(theme.theme);
  const shell = THEME_OPTIONS.find((opt) => opt.id === theme.theme) ?? THEME_OPTIONS[0];
  for (const btn of settingsPop.querySelectorAll('.theme-btn')) {
    const on = btn.dataset.theme === theme.theme;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  for (const btn of settingsPop.querySelectorAll('.swatch')) {
    btn.classList.toggle('on', btn.dataset.accent === theme.accent);
  }
  for (const btn of settingsPop.querySelectorAll('.editor-theme-btn')) {
    const opt = EDITOR_THEME_OPTIONS.find((item) => item.id === btn.dataset.editorTheme);
    if (!opt) continue;
    const on = theme.editorTheme === opt.id;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    const colors = opt.id === 'prettier'
      ? PRETTIER_PREVIEW[light ? 'light' : 'dark']
      : AUTO_PREVIEW[theme.theme] ?? AUTO_PREVIEW.dark;
    btn.querySelector('.editor-preview').style.background = shell.island;
    btn.querySelector('.tok-k').style.color = colors.k;
    btn.querySelector('.tok-f').style.color = colors.f;
    btn.querySelector('.tok-op').style.color = colors.k;
    btn.querySelector('.tok-n').style.color = colors.n;
    btn.querySelector('.tok-s').style.color = colors.s;
    btn.querySelector('.editor-theme-note').textContent =
      opt.id === 'prettier' ? 'Brighter, high-contrast syntax' : `Follows ${shell.label}`;
  }
}

function openSettings(anchor = settingsBtn) {
  closeMenu();
  closeProjects();
  renderSettings();
  settingsPop.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  const width = settingsPop.offsetWidth;
  const height = settingsPop.offsetHeight;
  const left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(rect.bottom - height, window.innerHeight - height - 8));
  settingsPop.style.left = `${left}px`;
  settingsPop.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('pointerdown', onSettingsOutside), 0);
  document.addEventListener('keydown', onSettingsKey);
}

function closeSettings() {
  if (settingsPop.classList.contains('hidden')) return;
  settingsPop.classList.add('hidden');
  settingsBtn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onSettingsOutside);
  document.removeEventListener('keydown', onSettingsKey);
}

function onSettingsOutside(event) {
  if (settingsPop.contains(event.target) || settingsBtn.contains(event.target)) return;
  closeSettings();
}
function onSettingsKey(event) {
  if (event.key === 'Escape') closeSettings();
}

function elSpan(cls, text) {
  const node = document.createElement('div');
  node.className = cls;
  node.textContent = text;
  return node;
}

function menuRow(text, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-row';
  btn.textContent = text;
  btn.addEventListener('click', () => {
    closeMenu();
    action?.();
  });
  return btn;
}

function themeGrid() {
  const wrap = document.createElement('div');
  wrap.className = 'themes';
  for (const opt of THEME_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `theme-btn${theme.theme === opt.id ? ' on' : ''}`;
    btn.dataset.theme = opt.id;
    btn.setAttribute('aria-pressed', theme.theme === opt.id ? 'true' : 'false');
    const dot = document.createElement('span');
    dot.className = 'theme-dot';
    dot.style.background = `linear-gradient(135deg, ${opt.frame} 0 50%, ${opt.island} 50% 100%)`;
    const label = document.createElement('span');
    label.className = 'theme-name';
    label.textContent = opt.label;
    btn.append(dot, label);
    btn.addEventListener('click', () => {
      theme.theme = opt.id;
      persist(THEME_KEY, theme);
      applyTheme();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function swatchRow() {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  for (const accent of ACCENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `swatch${theme.accent === accent ? ' on' : ''}`;
    btn.dataset.accent = accent;
    btn.style.background = accent;
    btn.setAttribute('aria-label', `Accent ${accent}`);
    btn.addEventListener('click', () => {
      theme.accent = accent;
      persist(THEME_KEY, theme);
      applyTheme();
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

function openMenu(anchor) {
  closeProjects();
  closeSettings();
  const rect = anchor.getBoundingClientRect();
  renderMenu();
  menuPop.classList.remove('hidden');
  // Prefer below the anchor; flip above when there is no room.
  const height = menuPop.offsetHeight;
  if (rect.bottom + height + 8 > window.innerHeight) {
    menuPop.style.top = 'auto';
    menuPop.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    menuPop.style.transformOrigin = 'bottom left';
  } else {
    menuPop.style.bottom = 'auto';
    menuPop.style.top = `${rect.bottom + 6}px`;
    menuPop.style.transformOrigin = 'top left';
  }
  menuPop.style.left = `${Math.min(rect.left, window.innerWidth - menuPop.offsetWidth - 8)}px`;
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('pointerdown', onMenuOutside), 0);
  document.addEventListener('keydown', onMenuKey);
}

function closeMenu() {
  if (menuPop.classList.contains('hidden')) return;
  menuPop.classList.add('hidden');
  menuBtn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onMenuOutside);
  document.removeEventListener('keydown', onMenuKey);
}

function onMenuOutside(event) {
  if (menuPop.contains(event.target) || menuBtn.contains(event.target)) return;
  closeMenu();
}
function onMenuKey(event) {
  if (event.key === 'Escape') closeMenu();
}

/* --- projects switcher -------------------------------------------------- */

function baseName(path = '') {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function readRecentProjects() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '');
    if (Array.isArray(raw)) return raw.filter((path) => typeof path === 'string' && path);
  } catch {
    // corrupt or missing — start fresh
  }
  return [];
}

function rememberProject(path) {
  if (!path) return;
  recentProjects = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 8);
  persist(PROJECTS_KEY, recentProjects);
}

function prettyRemote(url) {
  const cleaned = url.replace(/\.git$/i, '');
  const github = cleaned.match(/github\.com[:/]+(.+)$/i);
  return github ? github[1] : cleaned;
}

function setRemote(remote) {
  remoteChip.classList.toggle('dim', !remote);
  remoteLabel.textContent = remote ? prettyRemote(remote) : 'no remote found';
  remoteChip.title = remote ? `Remote: ${remote}` : 'No git remote configured';
}

function projectRow(path) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'menu-row project-row';
  row.title = path;
  row.append(elSpan('proj-name', baseName(path)), elSpan('proj-path', path));
  row.addEventListener('click', () => switchProject(path));
  return row;
}

function currentProjectCard() {
  const card = document.createElement('div');
  card.className = 'proj-current';
  if (!rootPath) {
    card.appendChild(elSpan('empty-note', 'No project open'));
    return card;
  }
  const icon = document.createElement('span');
  icon.className = 'proj-current-icon';
  icon.innerHTML = folderIcon;
  const info = document.createElement('div');
  info.className = 'proj-current-info';
  info.append(elSpan('proj-name', baseName(rootPath)), elSpan('proj-path', rootPath));
  card.title = rootPath;
  card.append(icon, info);
  return card;
}

function newProjectButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'proj-new';
  btn.title = 'Choose a folder to open as a project';
  const icon = document.createElement('span');
  icon.className = 'proj-new-icon';
  icon.innerHTML = plusIcon;
  btn.append(icon, document.createTextNode('New Project'));
  btn.addEventListener('click', pickProject);
  return btn;
}

async function pickProject() {
  if (!ipcAvailable()) {
    setStatus('Opening folders needs the Tauri desktop runtime');
    return;
  }
  closeProjects();
  try {
    const selected = await invoke('plugin:dialog|open', {
      options: {
        title: 'Open project folder',
        directory: true,
        multiple: false,
        defaultPath: rootPath || undefined,
      },
    });
    if (typeof selected === 'string' && selected) await switchProject(selected);
  } catch (err) {
    setStatus(`Could not open the folder picker: ${err}`);
  }
}

function renderProjects() {
  const others = recentProjects.filter((path) => path !== rootPath);
  const nodes = [
    elSpan('lbl', 'Current project'),
    currentProjectCard(),
    newProjectButton(),
  ];
  if (others.length > 0) {
    const list = document.createElement('div');
    list.className = 'project-list';
    list.append(...others.map(projectRow));
    nodes.push(elSpan('lbl', 'Recent'), list);
  }
  projectsPop.replaceChildren(...nodes);
}

function openProjects(anchor) {
  closeMenu();
  closeSettings();
  renderProjects();
  projectsPop.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  const height = projectsPop.offsetHeight;
  if (rect.bottom + height + 8 > window.innerHeight) {
    projectsPop.style.top = 'auto';
    projectsPop.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    projectsPop.style.transformOrigin = 'bottom left';
  } else {
    projectsPop.style.bottom = 'auto';
    projectsPop.style.top = `${rect.bottom + 6}px`;
    projectsPop.style.transformOrigin = 'top left';
  }
  projectsPop.style.left = `${Math.max(
    8,
    Math.min(rect.left, window.innerWidth - projectsPop.offsetWidth - 8)
  )}px`;
  anchor.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.addEventListener('pointerdown', onProjectsOutside), 0);
  document.addEventListener('keydown', onProjectsKey);
}

function closeProjects() {
  if (projectsPop.classList.contains('hidden')) return;
  projectsPop.classList.add('hidden');
  projectChip.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onProjectsOutside);
  document.removeEventListener('keydown', onProjectsKey);
}

function onProjectsOutside(event) {
  if (projectsPop.contains(event.target) || projectChip.contains(event.target)) return;
  closeProjects();
}
function onProjectsKey(event) {
  if (event.key === 'Escape') closeProjects();
}

async function switchProject(path) {
  if (!path) return;
  if (path === rootPath) {
    closeProjects();
    return;
  }
  if (!ipcAvailable()) {
    setStatus('Switching projects needs the Tauri desktop runtime');
    return;
  }
  try {
    await invoke('fs_list_dir', { path });
  } catch (err) {
    setStatus(`Cannot open project: ${err}`);
    return;
  }
  rootPath = path;
  rootName = baseName(path);
  persist(PROJECT_KEY, { path });
  rememberProject(path);
  closeProjects();
  searchResults.replaceChildren();
  tree = await mountFileTree(treeEl, {
    rootPath,
    onOpen: openFileFromTree,
    onStatus: setStatus,
  });
  if (window.__mcode) window.__mcode.tree = tree;
  setStatus(`Project: ${path}`);
  updateStatus();
  refreshGit();
}

/* --- rail + bottom tab state ---------------------------------------------- */

function saveShell() {
  persist(SHELL_KEY, { side: sideTool, bottom: bottomTab });
}

function setSideTool(name) {
  sideTool = name;
  for (const [key, btn] of Object.entries(railBtns)) {
    btn.classList.toggle('on', key === name);
    btn.setAttribute('aria-pressed', key === name ? 'true' : 'false');
  }
  for (const [key, view] of Object.entries(sideViews)) {
    view.classList.toggle('hidden', key !== name);
  }
  layout?.setSideCollapsed(name === '');
  if (name === 'search') setTimeout(() => searchInput.focus(), 0);
  saveShell();
}

function toggleSideTool(name) {
  setSideTool(sideTool === name ? '' : name);
}

function setBottomTab(name) {
  bottomTab = name;
  for (const [key, btn] of Object.entries(bottomTabBtns)) {
    btn.classList.toggle('on', key === name);
    btn.setAttribute('aria-selected', key === name ? 'true' : 'false');
  }
  for (const [key, view] of Object.entries(bottomViews)) {
    view.classList.toggle('hidden', key !== name);
  }
  layout?.setBottomCollapsed(name === '');
  if (name === 'terminal') {
    terminal?.show(rootPath);
  }
  if (name === 'output') outDot.classList.add('hidden');
  saveShell();
}

function toggleBottomTab(name) {
  setBottomTab(bottomTab === name ? '' : name);
}

/* --- status bar ------------------------------------------------------------- */

const chevronSep = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

function crumb(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  return span;
}

function updateStatus() {
  const info = editor?.activeInfo?.() ?? null;
  const projectLabel = rootPath ? rootName || baseName(rootPath) : 'Projects';
  if (projectName.textContent !== projectLabel) projectName.textContent = projectLabel;
  projectChip.title = rootPath ? `${rootPath} — switch project` : 'Switch project';
  projectChip.setAttribute(
    'aria-label',
    rootPath ? `Project: ${rootName || baseName(rootPath)}` : 'Projects'
  );
  const rootCrumb = crumb('crumb-dim', rootPath || 'No project');
  rootCrumb.title = rootPath || '';
  breadcrumbs.replaceChildren(rootCrumb);
  if (info?.path && rootPath) {
    let rel = info.path;
    if (rel.startsWith(`${rootPath}/`)) rel = rel.slice(rootPath.length + 1);
    const parts = rel.split(/[\\/]/);
    for (const part of parts.slice(0, -1)) {
      breadcrumbs.insertAdjacentHTML('beforeend', chevronSep);
      breadcrumbs.appendChild(crumb('crumb-dim', part));
    }
    breadcrumbs.insertAdjacentHTML('beforeend', chevronSep);
    breadcrumbs.appendChild(crumb('crumb-file', parts.at(-1)));
  }
  if (info) {
    sbSpaces.textContent = `Spaces: ${info.spaces}`;
    sbEol.textContent = info.eol;
    sbLang.textContent = info.language;
  } else {
    sbSpaces.textContent = 'Spaces: 2';
    sbEol.textContent = 'LF';
    sbLang.textContent = 'Plain Text';
  }
  tree?.setActiveFile(info?.path ?? null);
}

/* --- problems ---------------------------------------------------------------- */

function renderProblems() {
  const count = problemList.length;
  probCount.textContent = String(count);
  probCount.classList.toggle('hidden', count === 0);
  probDot.classList.toggle('hidden', count === 0);

  if (count === 0) {
    problemsList.replaceChildren(elSpan('empty-note', 'No problems detected'));
    return;
  }
  problemsList.replaceChildren(
    ...problemList.map((problem) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'problem-row';
      const icon = document.createElement('span');
      icon.className = `icon ${
        problem.severity >= 8 ? 'sev-error' : problem.severity >= 4 ? 'sev-warning' : 'sev-info'
      }`;
      icon.innerHTML = problem.severity >= 8 ? errorIcon : problem.severity >= 4 ? warningIcon : infoIcon;
      row.appendChild(icon);
      const msg = document.createElement('span');
      msg.className = 'p-msg';
      msg.textContent = problem.message;
      row.appendChild(msg);
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      row.appendChild(spacer);
      const loc = document.createElement('span');
      loc.className = 'p-loc';
      loc.textContent = `${problem.name} ${problem.line}:${problem.column}`;
      row.appendChild(loc);
      row.title = problem.path;
      row.addEventListener('click', () => {
        editor.revealLocation({ path: problem.path, line: problem.line, column: problem.column });
      });
      return row;
    })
  );
}

/* --- git ---------------------------------------------------------------------- */

async function refreshGit() {
  gitInfo = ipcAvailable() && rootPath ? await fetchGitStatus(rootPath) : null;
  const changes = gitInfo?.changes ?? [];

  branchName.textContent = gitInfo?.branch || 'no git';
  branchChip.title = gitInfo ? `Branch ${gitInfo.branch} — show changes` : 'Git unavailable';
  setRemote(gitInfo?.remote ?? null);
  gitDot.classList.toggle('hidden', changes.length === 0);

  tree?.setGitStatus(changes);

  if (!gitInfo) {
    gitChanges.replaceChildren(elSpan('empty-note', 'Not a git repository\ngit features are off here'));
  } else if (changes.length === 0) {
    gitChanges.replaceChildren(elSpan('empty-note', 'Working tree clean'));
  } else {
    gitChanges.replaceChildren(
      ...changes.map((change) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'row';
        row.style.paddingLeft = '8px';
        const parts = change.path.split('/');
        const name = document.createElement('span');
        name.textContent = parts.at(-1);
        row.appendChild(name);
        if (parts.length > 1) {
          const dir = document.createElement('span');
          dir.className = 'lbl';
          dir.textContent = parts.slice(0, -1).join('/');
          row.appendChild(dir);
        }
        const letter = document.createElement('span');
        letter.className = 'git-status-letter';
        letter.dataset.code = change.code;
        letter.textContent = change.code;
        row.appendChild(letter);
        row.title = change.path;
        row.addEventListener('click', async () => {
          try {
            const text = await invoke('fs_read_text_file', { path: `${rootPath}/${change.path}` });
            editor.open({ name: parts.at(-1), path: `${rootPath}/${change.path}`, text });
          } catch (err) {
            setStatus(`Could not open ${change.path}: ${err}`);
          }
        });
        return row;
      })
    );
  }

  if (!committing && !commitFlash) {
    commitBtn.disabled = changes.length === 0 || !gitInfo;
    commitBtn.textContent = changes.length
      ? `Commit ${changes.length} file${changes.length === 1 ? '' : 's'}`
      : 'Commit';
  }
}

function scheduleGitRefresh() {
  clearTimeout(gitTimer);
  gitTimer = setTimeout(refreshGit, 400);
}

function showCommitError(message) {
  commitError.textContent = message;
  // Restart the entrance + shake even when the same error fires twice.
  commitError.classList.remove('show');
  commitMsg.classList.remove('invalid');
  void commitError.offsetWidth;
  commitError.classList.add('show');
  commitMsg.classList.add('invalid');
  commitMsg.setAttribute('aria-invalid', 'true');
}

function clearCommitError() {
  if (!commitError.textContent) return;
  commitError.textContent = '';
  commitError.classList.remove('show');
  commitMsg.classList.remove('invalid');
  commitMsg.removeAttribute('aria-invalid');
}

function flashCommitSuccess() {
  clearTimeout(commitSuccessTimer);
  commitFlash = true;
  commitBtn.textContent = 'Committed';
  commitBtn.classList.add('success');
  commitSuccessTimer = setTimeout(() => {
    commitBtn.classList.remove('success');
    commitFlash = false;
    refreshGit();
  }, 1400);
}

async function doCommit() {
  if (committing) return;
  const message = commitMsg.value.trim();
  if (!message) {
    showCommitError('A commit message is required');
    commitMsg.focus();
    return;
  }
  clearCommitError();
  committing = true;
  commitBtn.disabled = true;
  commitBtn.classList.add('busy');
  commitBtn.setAttribute('aria-busy', 'true');
  commitBtn.textContent = 'Committing…';
  try {
    const result = await commit(rootPath, message);
    setStatus(`Committed: ${result || message}`);
    commitMsg.value = '';
    committing = false;
    commitBtn.classList.remove('busy');
    commitBtn.removeAttribute('aria-busy');
    await refreshGit();
    flashCommitSuccess();
  } catch (err) {
    committing = false;
    commitBtn.classList.remove('busy');
    commitBtn.removeAttribute('aria-busy');
    await refreshGit();
    showCommitError(`Commit failed: ${err}`);
    logOutput(`Commit failed: ${err}`, 'err');
  }
}

/* --- run presets ------------------------------------------------------------------ */

const RUN_PRESETS = [
  { name: 'dev', command: 'cargo run' },
  { name: 'build', command: 'cargo build' },
  { name: 'test', command: 'cargo test' },
  { name: 'check', command: 'cargo check' },
];

function renderRunList() {
  runList.replaceChildren(
    ...RUN_PRESETS.map((preset) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.style.paddingLeft = '8px';
      row.style.height = '30px';
      const icon = document.createElement('span');
      icon.innerHTML = runPlay(14);
      icon.style.color = 'var(--green)';
      row.appendChild(icon);
      const name = document.createElement('span');
      name.textContent = preset.name;
      name.style.color = preset.name === 'dev' ? 'var(--text-strong)' : '';
      row.appendChild(name);
      const spacer = document.createElement('span');
      spacer.style.flex = '1';
      row.appendChild(spacer);
      const cmd = document.createElement('span');
      cmd.className = 'lbl mono';
      cmd.style.fontSize = '11px';
      cmd.textContent = preset.command;
      row.appendChild(cmd);
      row.title = `Run "${preset.name}" in the terminal`;
      row.addEventListener('click', () => runPreset(preset));
      return row;
    })
  );
}

async function runPreset(preset) {
  if (!ipcAvailable()) {
    setStatus('Run presets need the Tauri desktop runtime');
    return;
  }
  setBottomTab('terminal');
  await terminal?.runCommand(preset.command, rootPath);
}

/* --- search -------------------------------------------------------------------------- */

function renderSearchChips() {
  for (const [key, chip] of Object.entries(searchChips)) {
    chip.classList.toggle('on', searchOpts[key]);
    chip.setAttribute('aria-pressed', searchOpts[key] ? 'true' : 'false');
  }
}

function renderRecentSearches() {
  if (!recentSearches.length || searchInput.value) {
    searchRecentWrap.classList.add('hidden');
    return;
  }
  searchRecentWrap.classList.remove('hidden');
  searchRecent.replaceChildren(
    ...recentSearches.map((query) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.style.paddingLeft = '8px';
      const icon = document.createElement('span');
      icon.innerHTML = clockIcon;
      icon.style.color = 'var(--text-dim)';
      row.appendChild(icon);
      const text = document.createElement('span');
      text.className = 'mono';
      text.style.fontSize = '12px';
      text.textContent = query;
      row.appendChild(text);
      row.addEventListener('click', () => {
        searchInput.value = query;
        runSearch();
      });
      return row;
    })
  );
}

function rememberSearch(query) {
  recentSearches = [query, ...recentSearches.filter((q) => q !== query)].slice(0, 5);
  persist(SEARCH_KEY, { recent: recentSearches });
}

async function runSearch() {
  const query = searchInput.value.trim();
  renderRecentSearches();
  if (!query) {
    searchResults.replaceChildren(elSpan('empty-note', 'Type to search across the project'));
    return;
  }
  if (!ipcAvailable() || !rootPath) {
    searchResults.replaceChildren(elSpan('empty-note', 'Search needs the Tauri desktop runtime'));
    return;
  }
  searchResults.replaceChildren(elSpan('empty-note', 'Searching…'));
  let hits;
  try {
    hits = await searchFiles(rootPath, {
      query,
      caseSensitive: searchOpts.case,
      wholeWord: searchOpts.word,
      useRegex: searchOpts.regex,
      limit: 200,
    });
  } catch (err) {
    searchResults.replaceChildren(elSpan('empty-note', `Search failed: ${err}`));
    return;
  }
  rememberSearch(query);
  renderRecentSearches();

  if (hits.length === 0) {
    searchResults.replaceChildren(elSpan('empty-note', 'No results'));
    return;
  }

  // group per file, keep order
  const byFile = new Map();
  for (const hit of hits) {
    if (!byFile.has(hit.path)) byFile.set(hit.path, []);
    byFile.get(hit.path).push(hit);
  }
  searchResults.replaceChildren(
    ...Array.from(byFile.entries()).flatMap(([path, fileHits]) => {
      const parts = path.split(/[\\/]/);
      const fileRow = document.createElement('button');
      fileRow.type = 'button';
      fileRow.className = 'row';
      fileRow.style.paddingLeft = '6px';
      const fileEl = document.createElement('span');
      fileEl.className = 'result-file';
      fileEl.textContent = parts.at(-1);
      fileRow.appendChild(fileEl);
      const dirEl = document.createElement('span');
      dirEl.className = 'result-dir';
      dirEl.textContent = parts.slice(0, -1).join('/');
      fileRow.appendChild(dirEl);
      fileRow.title = path;
      fileRow.addEventListener('click', () => {
        editor.revealLocation({ path, line: fileHits[0].line, column: fileHits[0].column });
      });

      const lineRows = fileHits.map((hit) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'row';
        row.style.paddingLeft = '22px';
        row.style.height = '22px';
        const lineNo = document.createElement('span');
        lineNo.className = 'lbl mono';
        lineNo.style.fontSize = '11px';
        lineNo.style.minWidth = '28px';
        lineNo.textContent = String(hit.line);
        row.appendChild(lineNo);
        const text = document.createElement('span');
        text.className = 'result-line mono';
        text.innerHTML = highlight(hit.text, query, {
          caseSensitive: searchOpts.case,
          wholeWord: searchOpts.word,
          useRegex: searchOpts.regex,
        });
        row.appendChild(text);
        row.addEventListener('click', () => {
          editor.revealLocation({ path, line: hit.line, column: hit.column });
        });
        return row;
      });
      return [fileRow, ...lineRows];
    })
  );
}

/* --- init ------------------------------------------------------------------------------ */

function saveReporter(message) {
  setStatus(message);
  scheduleGitRefresh();
}

window.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    editor?.save(saveReporter);
  }
  if (mod && event.key === '`') {
    event.preventDefault();
    toggleBottomTab('terminal');
  }
  if (mod && !event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    if (sideTool === '') setSideTool('files');
    else setSideTool('');
  }
  if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    setSideTool('search');
  }
});

window.addEventListener('focus', scheduleGitRefresh);

async function init() {
  loadTheme();
  const shell = readJson(SHELL_KEY, { side: sideTool, bottom: bottomTab });
  sideTool = shell.side ?? 'files';
  bottomTab = shell.bottom ?? 'terminal';
  const savedSearch = readJson(SEARCH_KEY, {});
  searchOpts = {
    case: Boolean(savedSearch.case),
    word: Boolean(savedSearch.word),
    regex: Boolean(savedSearch.regex),
  };
  recentSearches = Array.isArray(savedSearch.recent) ? savedSearch.recent : [];

  // icons into static buttons
  menuBtn.innerHTML = menuIcon;
  headerSearchBtn.innerHTML = searchIcon;
  $('project-icon').innerHTML = folderIcon;
  $('project-caret').innerHTML = chevronDownIcon;
  $('branch-icon').innerHTML = gitIcon;
  $('remote-icon').innerHTML = githubIcon;
  runChip.querySelector('.wg-icon.accent').innerHTML = playIcon(14);
  runChip.querySelector('.wg-icon:last-child').innerHTML = chevronDownIcon;
  for (const [key, btn] of Object.entries(railBtns)) {
    btn.insertAdjacentHTML(
      'afterbegin',
      { files: '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
        search: '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
        git: gitIcon,
        run: playIcon(20),
        plugins: pluginsIcon,
      }[key]
    );
  }
  for (const [key, btn] of Object.entries(railBottomBtns)) {
    btn.insertAdjacentHTML('afterbegin', key === 'terminal' ? terminalIcon : problemsIcon);
  }
  $('tool-settings').innerHTML = settingsIcon;
  $('tree-new-file').innerHTML = filePlusIcon;
  $('tree-collapse').innerHTML = collapseIcon;
  searchClearBtn.innerHTML = closeIcon;
  gitRefreshBtn.innerHTML = refreshIcon;
  runAddBtn.innerHTML = plusIcon;
  terminalNewBtn.innerHTML = plusIcon;
  bottomCloseBtn.innerHTML = closeIcon;

  layout = initLayout({ app: appEl, sideGrip, bottomGrip });

  applyTheme();
  renderSearchChips();
  renderRunList();
  renderRecentSearches();

  try {
    editor = await createEditor({
      container: editorEl,
      tabsBar: tabsEl,
      onStateChange: updateStatus,
      readFile: async (path) => invoke('fs_read_text_file', { path }),
    });
  } catch (err) {
    setStatus(`Editor failed to load: ${err}`);
    return;
  }
  editor.onCursor((pos) => {
    sbPos.textContent = `Ln ${pos.line}, Col ${pos.column}`;
  });
  editor.onMarkers((list) => {
    problemList = list;
    renderProblems();
  });

  terminal = createTerminal({ host: terminalHost, onStatus: setStatus });
  // Editor and terminal are created after the first applyTheme call; sync them
  // with the saved theme now that both exist.
  applyTheme();

  if (!ipcAvailable()) {
    tree = await mountFileTree(treeEl, {
      rootPath: null,
      onOpen: openFileFromTree,
      onStatus: setStatus,
    });
    // Debug/e2e hook: drive the shell from tests without Tauri IPC.
    window.__mcode = { editor, terminal, tree };
    renderProblems();
    setStatus('Running outside Tauri — IPC unavailable');
    branchName.textContent = 'no git';
    setRemote(null);
    setSideTool(sideTool || 'files');
    setBottomTab(bottomTab || 'terminal');
    updateStatus();
    refreshGit();
    return;
  }

  try {
    version = await invoke('app_version');
  } catch {
    version = '';
  }

  recentProjects = readRecentProjects();
  const savedProject = readJson(PROJECT_KEY, { path: '' }).path;
  if (savedProject) {
    try {
      await invoke('fs_list_dir', { path: savedProject });
      rootPath = savedProject;
    } catch {
      rootPath = null;
    }
  }
  if (!rootPath) {
    try {
      rootPath = await invoke('fs_default_root');
    } catch {
      rootPath = null;
    }
  }
  if (rootPath) {
    rootName = baseName(rootPath);
    rememberProject(rootPath);
  }

  tree = await mountFileTree(treeEl, {
    rootPath,
    onOpen: openFileFromTree,
    onStatus: setStatus,
  });

  // Debug/e2e hook: drive the shell from tests without Tauri IPC.
  window.__mcode = { editor, terminal, tree };

  setSideTool(sideTool || 'files');
  setBottomTab(bottomTab || 'terminal');
  setStatus('Ready — core connected');
  updateStatus();
  refreshGit();
}

async function openFileFromTree(entry) {
  try {
    const text = await invoke('fs_read_text_file', { path: entry.path });
    editor.open({ name: entry.name, path: entry.path, text });
  } catch (err) {
    setStatus(`Could not open ${entry.name}: ${err}`);
  }
}

/* --- wire static listeners --------------------------------------------------------------- */

menuBtn.addEventListener('click', () => (menuPop.classList.contains('hidden') ? openMenu(menuBtn) : closeMenu()));
settingsBtn.addEventListener('click', () =>
  settingsPop.classList.contains('hidden') ? openSettings(settingsBtn) : closeSettings()
);
projectChip.addEventListener('click', () =>
  projectsPop.classList.contains('hidden') ? openProjects(projectChip) : closeProjects()
);
branchChip.addEventListener('click', () => {
  toggleSideTool('git');
  refreshGit();
});
runChip.addEventListener('click', () => runPreset(RUN_PRESETS[0]));
headerSearchBtn.addEventListener('click', () => setSideTool('search'));

for (const [key, btn] of Object.entries(railBtns)) {
  btn.addEventListener('click', () => toggleSideTool(key));
}
for (const [key, btn] of Object.entries(railBottomBtns)) {
  btn.addEventListener('click', () => toggleBottomTab(key));
}

for (const [key, btn] of Object.entries(bottomTabBtns)) {
  btn.addEventListener('click', () => setBottomTab(key));
}
terminalNewBtn.addEventListener('click', () => terminal?.newSession(rootPath));
bottomCloseBtn.addEventListener('click', () => setBottomTab(''));
$('tree-collapse').addEventListener('click', () => tree?.collapseAll());
$('tree-new-file').addEventListener('click', () => setStatus('New-file flow is on the roadmap — create it from your file manager for now'));
$('run-add').addEventListener('click', () => setStatus('Custom run configurations are on the roadmap'));

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runSearch();
});
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 450);
});
for (const [key, chip] of Object.entries(searchChips)) {
  chip.addEventListener('click', () => {
    searchOpts[key] = !searchOpts[key];
    persist(SEARCH_KEY, { ...searchOpts, recent: recentSearches });
    renderSearchChips();
    runSearch();
  });
}
searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchResults.replaceChildren();
  renderRecentSearches();
  searchInput.focus();
});

commitBtn.addEventListener('click', doCommit);
commitMsg.addEventListener('input', clearCommitError);
commitMsg.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') doCommit();
});
gitRefreshBtn.addEventListener('click', refreshGit);

init();
