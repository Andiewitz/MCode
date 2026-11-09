// Thin Tauri IPC access: feature modules never touch window.__TAURI__ directly.
// (withGlobalTauri is enabled in src-tauri/tauri.conf.json.)

export function ipcAvailable() {
  return Boolean(window.__TAURI__);
}

export function invoke(command, args = {}) {
  if (!ipcAvailable()) {
    return Promise.reject(new Error('Tauri IPC unavailable'));
  }
  return window.__TAURI__.core.invoke(command, args);
}

export function listen(event, handler) {
  if (!ipcAvailable() || !window.__TAURI__?.event?.listen) {
    return Promise.resolve(() => {});
  }
  return window.__TAURI__.event.listen(event, handler);
}
