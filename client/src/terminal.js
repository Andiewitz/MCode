import { invoke, listen, ipcAvailable } from './ipc.js';

export function createTerminal({ host, onStatus }) {
  let term = null;
  let fitAddon = null;
  let sessionId = null;
  let unlistenData = null;
  let unlistenExit = null;
  let resizeObserver = null;

  async function ensure() {
    if (term) return;
    const Terminal = window.Terminal || globalThis.Terminal;
    if (!Terminal) throw new Error('xterm.js not available');
    term = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: '#16181d',
        foreground: '#e6e8ec',
        cursor: '#4f8cff',
        selectionBackground: '#26344d',
        black: '#16181d',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
      },
    });
    const fitMod = window.FitAddon || globalThis.FitAddon;
    const Fit = fitMod?.FitAddon || fitMod;
    if (Fit) {
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
          onStatus?.('Terminal exited');
        }
      });
    }
  }

  function fit() {
    if (!term || host.classList.contains('hidden')) return;
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
      onStatus?.(`Terminal error: ${err}`);
    }
    setTimeout(() => { fit(); term?.focus(); }, 0);
  }

  function dispose() {
    resizeObserver?.disconnect();
    unlistenData?.then?.((f) => f?.());
    unlistenExit?.then?.((f) => f?.());
    if (sessionId != null) invoke('terminal_kill', { id: sessionId }).catch(() => {});
    term?.dispose();
  }

  return { start, show, fit, dispose };
}
