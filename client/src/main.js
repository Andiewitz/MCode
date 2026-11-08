// MCode client entry point.
//
// Talks to the Rust core over Tauri IPC. `withGlobalTauri` is enabled in
// src-tauri/tauri.conf.json so we don't need a JS package/bundler yet.

/**
 * Resolve the IPC invoke function, or null when running outside Tauri
 * (e.g. opening index.html in a plain browser during development).
 */
function getInvoke() {
  if (window.__TAURI__ && window.__TAURI__.core) {
    return window.__TAURI__.core.invoke;
  }
  return null;
}

const statusLeft = document.getElementById('status-left');
const statusRight = document.getElementById('status-right');

async function init() {
  const invoke = getInvoke();
  if (!invoke) {
    statusLeft.textContent = 'Running outside Tauri — IPC unavailable';
    return;
  }

  try {
    const version = await invoke('app_version');
    statusRight.textContent = `v${version}`;
    statusLeft.textContent = 'Ready — core connected';
  } catch (err) {
    statusLeft.textContent = `Core unreachable: ${err}`;
  }
}

init();
