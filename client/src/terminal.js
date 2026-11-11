import { invoke, listen, ipcAvailable } from './ipc.js';

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

export function createTerminal({ host, onStatus }) {
  let term = null;
  let fitAddon = null;
  let sessionId = null;
  let unlistenData = null;
  let unlistenExit = null;
  let resizeObserver = null;
  let theme = 'dark';

  async function ensure() {
    if (term) return;
    const { Terminal, FitAddon } = await ensureXterm();
    term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', monospace",
      fontSize: 12.5,
      lineHeight: 1.2,
      theme: PALETTES[theme] ?? PALETTES.dark,
    });
    const Fit = FitAddon?.FitAddon || FitAddon;
    if (typeof Fit === 'function') {
      fitAddon = new Fit();
      term.loadAddon(fitAddon);
    }
    term.open(host);

    term.onData((data) => {
      if (sessionId != null) invoke('terminal_write', { id: sessionId, data }).catch(() => {});
    });

    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(host);

    if (ipcAvailable()) {
      unlistenExit = await listen('terminal://exit', (event) => {
        if (event?.payload?.id === sessionId) {
          term?.writeln('\r\n[process exited]');
          sessionId = null;
          onStatus?.('Terminal exited');
        }
      });
    }
  }

  function fit() {
    if (!term) return;
    if (host.closest('.hidden')) return;
    try { fitAddon?.fit(); } catch {}
    if (sessionId != null) {
      invoke('terminal_resize', { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    }
  }

  async function start(cwd) {
    await ensure();
    if (sessionId != null) return;
    if (!ipcAvailable()) {
      term.writeln('Terminal requires the Tauri desktop runtime.');
      return;
    }
    fit();
    try {
      sessionId = await invoke('terminal_create', {
        cwd: cwd || null,
        cols: term.cols || 80,
        rows: term.rows || 24,
      });
      unlistenData = await listen(`terminal://data/${sessionId}`, (event) => {
        term?.write(event.payload ?? '');
      });
      onStatus?.('Terminal ready');
    } catch (err) {
      term?.writeln(`\r\nFailed to start terminal: ${err}`);
      onStatus?.(`Terminal failed: ${err}`);
    }
  }

  async function show(cwd) {
    host.parentElement?.classList.remove('hidden');
    try {
      await start(cwd);
    } catch (err) {
      term?.writeln?.(`\r\n${err}`);
      onStatus?.(`Terminal error: ${err}`);
    }
    setTimeout(() => { fit(); }, 0);
  }

  // Write a command line into the running shell (used by Run presets).
  async function runCommand(command, cwd) {
    await show(cwd);
    if (sessionId == null) {
      onStatus?.('Terminal unavailable — cannot run command');
      return;
    }
    invoke('terminal_write', { id: sessionId, data: `${command}\r` }).catch(() => {});
  }

  // Kill the current shell and start a fresh one.
  async function newSession(cwd) {
    if (sessionId != null) {
      await invoke('terminal_kill', { id: sessionId }).catch(() => {});
      sessionId = null;
    }
    if (term) {
      term.dispose();
      term = null;
      fitAddon = null;
    }
    host.replaceChildren();
    resizeObserver?.disconnect();
    resizeObserver = null;
    await show(cwd);
    setTimeout(() => term?.focus(), 0);
  }

  function setTheme(next) {
    theme = next;
    if (term) term.options.theme = PALETTES[theme] ?? PALETTES.dark;
  }

  function dispose() {
    resizeObserver?.disconnect();
    unlistenData?.then?.((f) => f?.());
    unlistenExit?.then?.((f) => f?.());
    if (sessionId != null) invoke('terminal_kill', { id: sessionId }).catch(() => {});
    term?.dispose();
  }

  return { start, show, fit, runCommand, newSession, setTheme, dispose };
}
