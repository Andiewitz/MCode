import { invoke, listen, ipcAvailable } from './ipc.js';
import { closeIcon } from './icons.js';

const PALETTES = {
  dark: {
    background: '#1e1f22',
    foreground: '#BCBEC4',
    cursor: '#F2F3F5',
    cursorAccent: '#1e1f22',
    selectionBackground: '#22304E',
    black: '#1e1f22',
    red: '#F07178',
    green: '#6FC27A',
    yellow: '#E5B567',
    blue: '#56A8F5',
    magenta: '#C77DBB',
    cyan: '#2AACB8',
    white: '#BCBEC4',
    brightBlack: '#8A8D94',
    brightRed: '#F07178',
    brightGreen: '#6FC27A',
    brightYellow: '#E5B567',
    brightBlue: '#56A8F5',
    brightMagenta: '#C77DBB',
    brightCyan: '#2AACB8',
    brightWhite: '#F2F3F5',
  },
  light: {
    background: '#ffffff',
    foreground: '#2B2D30',
    cursor: '#0F1012',
    cursorAccent: '#ffffff',
    selectionBackground: '#E2EAFC',
    black: '#0F1012',
    red: '#C7302C',
    green: '#1F7A2E',
    yellow: '#9A6A00',
    blue: '#1E58D8',
    magenta: '#871094',
    cyan: '#00627A',
    white: '#2B2D30',
    brightBlack: '#6C707E',
    brightRed: '#C7302C',
    brightGreen: '#1F7A2E',
    brightYellow: '#9A6A00',
    brightBlue: '#1E58D8',
    brightMagenta: '#871094',
    brightCyan: '#00627A',
    brightWhite: '#0F1012',
  },
  charcoal: {
    background: '#191919',
    foreground: '#C4C4C4',
    cursor: '#F4F4F4',
    cursorAccent: '#191919',
    selectionBackground: '#333333',
    black: '#191919',
    red: '#F07178',
    green: '#6FC27A',
    yellow: '#E5B567',
    blue: '#56A8F5',
    magenta: '#C77DBB',
    cyan: '#2AACB8',
    white: '#C4C4C4',
    brightBlack: '#8E8E8E',
    brightRed: '#F07178',
    brightGreen: '#6FC27A',
    brightYellow: '#E5B567',
    brightBlue: '#56A8F5',
    brightMagenta: '#C77DBB',
    brightCyan: '#2AACB8',
    brightWhite: '#F4F4F4',
  },
  midnight: {
    background: '#0A0F18',
    foreground: '#C3CBE0',
    cursor: '#EEF3FF',
    cursorAccent: '#0A0F18',
    selectionBackground: '#1B2A44',
    black: '#0A0F18',
    red: '#FF7B86',
    green: '#7BD88F',
    yellow: '#E7C07A',
    blue: '#79A6FF',
    magenta: '#D08BDB',
    cyan: '#4FC1D4',
    white: '#C3CBE0',
    brightBlack: '#7E8AA3',
    brightRed: '#FF7B86',
    brightGreen: '#7BD88F',
    brightYellow: '#E7C07A',
    brightBlue: '#79A6FF',
    brightMagenta: '#D08BDB',
    brightCyan: '#4FC1D4',
    brightWhite: '#EEF3FF',
  },
  warm: {
    background: '#FCF9F3',
    foreground: '#3B352D',
    cursor: '#1C1813',
    cursorAccent: '#FCF9F3',
    selectionBackground: '#E8DECB',
    black: '#1C1813',
    red: '#B83A34',
    green: '#2C7A3F',
    yellow: '#8A6200',
    blue: '#2A5FB0',
    magenta: '#8A3F8F',
    cyan: '#226B72',
    white: '#3B352D',
    brightBlack: '#7B7265',
    brightRed: '#B83A34',
    brightGreen: '#2C7A3F',
    brightYellow: '#8A6200',
    brightBlue: '#2A5FB0',
    brightMagenta: '#8A3F8F',
    brightCyan: '#226B72',
    brightWhite: '#1C1813',
  },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((s) => (s.dataset.src || s.getAttribute('src')) === src);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const prevDefine = window.define;
    const prevAmd = prevDefine?.amd;
    try { if (window.define) window.define.amd = false; } catch {}
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.dataset.src = src;
    s.onload = () => {
      s.dataset.loaded = '1';
      try { if (prevDefine) { window.define = prevDefine; window.define.amd = prevAmd; } else { delete window.define; } } catch {}
      resolve();
    };
    s.onerror = () => {
      try { if (prevDefine) { window.define = prevDefine; window.define.amd = prevAmd; } else { delete window.define; } } catch {}
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

async function ensureXterm() {
  let Terminal = window.Terminal || globalThis.Terminal || self.Terminal;
  let FitAddon = window.FitAddon || globalThis.FitAddon || self.FitAddon;
  if (!Terminal) {
    try { await loadScript('./vendor/xterm/xterm.js'); } catch (e) {
      const probe = Object.keys(globalThis).filter((k) => /Terminal|xterm/i.test(k)).slice(0, 8).join(', ');
      throw new Error(`xterm.js failed to load (${e.message || e})${probe ? `; globals: ${probe}` : ''}`);
    }
    Terminal = window.Terminal || globalThis.Terminal || self.Terminal;
  }
  if (!FitAddon) {
    try { await loadScript('./vendor/xterm/addon-fit.js'); } catch {}
    FitAddon = window.FitAddon || globalThis.FitAddon || self.FitAddon;
  }
  if (Terminal && typeof Terminal !== 'function' && typeof Terminal.Terminal === 'function') Terminal = Terminal.Terminal;
  if (FitAddon && typeof FitAddon !== 'function') FitAddon = FitAddon.FitAddon || FitAddon.default || FitAddon;
  if (typeof Terminal !== 'function') {
    const probe = Object.keys(globalThis).filter((k) => /Terminal|xterm|FitAddon/i.test(k)).slice(0, 10).join(', ');
    const amd = !!(window.define && window.define.amd);
    throw new Error(`xterm Terminal global missing${probe ? `; globals: ${probe}` : ''}; amd=${amd}; check ./vendor/xterm/xterm.js`);
  }
  return { Terminal, FitAddon };
}

let xtermPromise = null;

function loadXterm() {
  if (!xtermPromise) xtermPromise = ensureXterm();
  return xtermPromise;
}

export function createTerminal({ host, tabs, onStatus }) {
  let instances = [];
  let activeId = null;
  let seq = 0;
  let counter = 0;
  let theme = 'dark';
  let lastCwd = null;
  let emptyEl = null;
  let unlistenExit = null;
  let exitListenerReady = false;

  function activeInstance() {
    return instances.find((inst) => inst.id === activeId) ?? instances[0] ?? null;
  }

  function updateTabs() {
    if (!tabs) return;
    tabs.replaceChildren(
      ...instances.map((inst) => {
        const tab = document.createElement('div');
        tab.className = `term-tab${inst.id === activeId ? ' on' : ''}`;
        tab.dataset.id = String(inst.id);
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', inst.id === activeId ? 'true' : 'false');
        tab.tabIndex = inst.id === activeId ? 0 : -1;

        const label = document.createElement('span');
        label.className = 'term-tab-label';
        label.textContent = inst.label;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'term-tab-close';
        close.setAttribute('aria-label', `Close ${inst.label}`);
        close.innerHTML = closeIcon;
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          remove(inst.id);
        });

        tab.append(label, close);
        tab.addEventListener('click', () => activate(inst.id));
        tab.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(inst.id);
          }
        });
        return tab;
      })
    );
    tabs.classList.toggle('hidden', instances.length === 0);
  }

  function renderEmpty() {
    if (instances.length > 0) {
      emptyEl?.remove();
      emptyEl = null;
      return;
    }
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'term-empty';
      const note = document.createElement('span');
      note.textContent = 'No terminals open';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wg';
      btn.textContent = 'New terminal';
      btn.addEventListener('click', () => add(lastCwd));
      emptyEl.append(note, btn);
    }
    if (emptyEl.parentElement !== host) host.appendChild(emptyEl);
  }

  async function ensureExitListener() {
    if (exitListenerReady) return;
    exitListenerReady = true;
    if (!ipcAvailable()) return;
    unlistenExit = await listen('terminal://exit', (event) => {
      const inst = instances.find((item) => item.sessionId === event?.payload?.id);
      if (!inst) return;
      inst.term?.writeln('\r\n[process exited]');
      inst.sessionId = null;
      onStatus?.('Terminal exited');
    });
  }

  function fitInstance(inst) {
    if (!inst?.term) return;
    if (inst.pane.classList.contains('hidden') || inst.pane.closest('.hidden')) return;
    try { inst.fitAddon?.fit(); } catch {}
    if (inst.sessionId != null) {
      invoke('terminal_resize', {
        id: inst.sessionId,
        cols: inst.term.cols,
        rows: inst.term.rows,
      }).catch(() => {});
    }
  }

  function fit() {
    const inst = activeInstance();
    if (inst) fitInstance(inst);
  }

  function activate(id) {
    const inst = instances.find((item) => item.id === id);
    if (!inst) return;
    activeId = id;
    for (const item of instances) {
      item.pane.classList.toggle('hidden', item.id !== id);
    }
    updateTabs();
    setTimeout(() => {
      fitInstance(inst);
      inst.term?.focus();
    }, 0);
  }

  async function start(inst, cwd) {
    if (!inst || inst.sessionId != null) return;
    if (!ipcAvailable()) {
      inst.term.writeln('Terminal requires the Tauri desktop runtime.');
      return;
    }
    lastCwd = cwd || lastCwd;
    fitInstance(inst);
    try {
      const sessionId = await invoke('terminal_create', {
        cwd: cwd || null,
        cols: inst.term.cols || 80,
        rows: inst.term.rows || 24,
      });
      inst.sessionId = sessionId;
      inst.unlistenData = await listen(`terminal://data/${sessionId}`, (event) => {
        inst.term?.write(event.payload ?? '');
      });
      onStatus?.('Terminal ready');
    } catch (err) {
      inst.term?.writeln(`\r\nFailed to start terminal: ${err}`);
      onStatus?.(`Terminal failed: ${err}`);
    }
  }

  async function createInstance(cwd) {
    const { Terminal, FitAddon } = await loadXterm();
    await ensureExitListener();

    const id = ++seq;
    const pane = document.createElement('div');
    pane.className = 'term-pane';
    pane.dataset.id = String(id);
    host.appendChild(pane);

    const term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', monospace",
      fontSize: 12.5,
      lineHeight: 1.2,
      theme: PALETTES[theme] ?? PALETTES.dark,
    });
    const Fit = FitAddon?.FitAddon || FitAddon;
    const fitAddon = typeof Fit === 'function' ? new Fit() : null;
    if (fitAddon) term.loadAddon(fitAddon);
    term.open(pane);

    const inst = {
      id,
      label: `Terminal ${++counter}`,
      term,
      fitAddon,
      pane,
      sessionId: null,
      unlistenData: null,
      resizeObserver: null,
    };

    term.onData((data) => {
      if (inst.sessionId != null) invoke('terminal_write', { id: inst.sessionId, data }).catch(() => {});
    });

    inst.resizeObserver = new ResizeObserver(() => fitInstance(inst));
    inst.resizeObserver.observe(pane);

    instances.push(inst);
    activeId = id;
    updateTabs();
    renderEmpty();
    activate(id);
    await start(inst, cwd || lastCwd);
    return inst;
  }

  async function add(cwd) {
    const inst = await createInstance(cwd || lastCwd);
    activate(inst.id);
    return inst.id;
  }

  async function remove(id) {
    const index = instances.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [inst] = instances.splice(index, 1);
    inst.resizeObserver?.disconnect();
    if (inst.sessionId != null) invoke('terminal_kill', { id: inst.sessionId }).catch(() => {});
    if (inst.unlistenData) {
      try { (await inst.unlistenData)(); } catch {}
      inst.unlistenData = null;
    }
    inst.term?.dispose();
    inst.pane.remove();
    if (activeId === id) {
      const next = instances[index] ?? instances[index - 1] ?? null;
      activeId = next?.id ?? null;
      if (next) activate(next.id);
    }
    updateTabs();
    renderEmpty();
  }

  async function show(cwd) {
    lastCwd = cwd || lastCwd;
    if (instances.length === 0) {
      await add(lastCwd);
      return;
    }
    const inst = activeInstance();
    if (!inst) return;
    activate(inst.id);
    if (inst.sessionId == null) await start(inst, lastCwd);
    setTimeout(() => fitInstance(inst), 0);
  }

  // Write a command line into the active shell (used by Run presets).
  async function runCommand(command, cwd) {
    lastCwd = cwd || lastCwd;
    if (instances.length === 0) await add(lastCwd);
    const inst = activeInstance();
    if (!inst) {
      onStatus?.('Terminal unavailable — cannot run command');
      return;
    }
    activate(inst.id);
    if (inst.sessionId == null) await start(inst, lastCwd);
    if (inst.sessionId == null) {
      onStatus?.('Terminal unavailable — cannot run command');
      return;
    }
    invoke('terminal_write', { id: inst.sessionId, data: `${command}\r` }).catch(() => {});
  }

  // Restart every shell in the new project root (used when switching projects).
  // Each instance is isolated: one failed restart must not strand the rest in
  // the previous project directory.
  async function resetAll(cwd) {
    lastCwd = cwd || lastCwd;
    for (const inst of instances) {
      try {
        if (inst.sessionId != null) {
          await invoke('terminal_kill', { id: inst.sessionId }).catch(() => {});
          inst.sessionId = null;
        }
        if (inst.unlistenData) {
          try { (await inst.unlistenData)(); } catch {}
          inst.unlistenData = null;
        }
        inst.term?.reset();
      } catch (err) {
        onStatus?.(`Terminal cleanup failed: ${err}`);
      }
      // Always try to start a fresh shell, even if cleanup hit an error.
      await start(inst, lastCwd);
    }
    fit();
  }

  function setTheme(next) {
    theme = next;
    for (const inst of instances) {
      if (inst.term) inst.term.options.theme = PALETTES[theme] ?? PALETTES.dark;
    }
  }

  function dispose() {
    for (const inst of instances) {
      inst.resizeObserver?.disconnect();
      inst.unlistenData?.then?.((f) => f?.());
      if (inst.sessionId != null) invoke('terminal_kill', { id: inst.sessionId }).catch(() => {});
      inst.term?.dispose();
      inst.pane.remove();
    }
    instances = [];
    unlistenExit?.then?.((f) => f?.());
  }

  return { start: show, show, add, remove, fit, runCommand, resetAll, setTheme, dispose };
}
