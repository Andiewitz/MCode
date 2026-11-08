// Layout controller: sidebar width (drag), collapse state (toggle + Ctrl+B),
// and persistence through localStorage.
//
// The sidebar column is a CSS variable on #app; the grip between the
// columns is both the drag handle and a double-click reset.

const STORE_KEY = 'mcode.layout';
const MIN_WIDTH = 200;
const MAX_FRACTION = 0.6;
const DEFAULT_WIDTH = 264;

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '');
    if (raw && typeof raw === 'object') {
      return {
        width: Number.isFinite(raw.width) ? raw.width : DEFAULT_WIDTH,
        collapsed: Boolean(raw.collapsed),
      };
    }
  } catch {
    // corrupt or missing state — fall through to defaults
  }
  return { width: DEFAULT_WIDTH, collapsed: false };
}

export function initLayout({ app, grip, toggle }) {
  let { width, collapsed } = readState();

  const clamp = (w) => {
    const max = Math.floor(window.innerWidth * MAX_FRACTION);
    return Math.min(Math.max(Math.round(w), MIN_WIDTH), Math.max(MIN_WIDTH, max));
  };

  const apply = () => {
    app.style.setProperty('--sidebar-w', collapsed ? '0px' : `${Math.round(width)}px`);
    app.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    toggle.setAttribute('aria-expanded', 'false');
  };

  const persist = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ width: Math.round(width), collapsed }));
    } catch {
      // storage unavailable — session-only layout
    }
  };

  const flip = () => {
    collapsed = !collapsed;
    apply();
    persist();
  };

  toggle.addEventListener('click', flip);

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      flip();
    }
  });

  grip.addEventListener('dblclick', () => {
    width = DEFAULT_WIDTH;
    collapsed = false;
    apply();
    persist();
  });

  let drag = null;
  grip.addEventListener('pointerdown', (event) => {
    if (collapsed || event.button !== 0) return;
    drag = { startX: event.clientX, startW: width };
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      // capture unsupported — listeners on the grip still track
    }
    document.body.classList.add('col-resizing');
    event.preventDefault();
  });

  grip.addEventListener('pointermove', (event) => {
    if (!drag) return;
    width = clamp(drag.startW + (event.clientX - drag.startX));
    apply();
  });

  const endDrag = (event) => {
    if (!drag) return;
    drag = null;
    try {
      grip.releasePointerCapture(event.pointerId);
    } catch {
      // never captured
    }
    document.body.classList.remove('col-resizing');
    persist();
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // Keep the sidebar inside bounds when the window shrinks.
  window.addEventListener('resize', () => {
    if (!collapsed) {
      width = clamp(width);
      apply();
    }
  });

  width = clamp(width);
  apply();
  return { isCollapsed: () => collapsed };
}
