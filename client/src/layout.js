// Layout controller for the islands shell:
//  - side island width (drag #side-grip), collapse state (Ctrl+B)
//  - bottom island height (drag #bottom-grip), collapse state (Ctrl+`)
// All of it persists through localStorage.

const STORE_KEY = 'mcode.layout';
const SIDE_MIN = 200;
const SIDE_MAX_FRACTION = 0.6;
const SIDE_DEFAULT = 264;
const BOTTOM_MIN = 120;
const BOTTOM_MAX_FRACTION = 0.85;
const BOTTOM_DEFAULT = 236;

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '');
    if (raw && typeof raw === 'object') {
      return {
        sideW: Number.isFinite(raw.sideW) ? raw.sideW : SIDE_DEFAULT,
        sideCollapsed: Boolean(raw.sideCollapsed),
        bottomH: Number.isFinite(raw.bottomH) ? raw.bottomH : BOTTOM_DEFAULT,
        bottomCollapsed: Boolean(raw.bottomCollapsed),
      };
    }
  } catch {
    // corrupt or missing state — fall through to defaults
  }
  return {
    sideW: SIDE_DEFAULT,
    sideCollapsed: false,
    bottomH: BOTTOM_DEFAULT,
    bottomCollapsed: false,
  };
}

export function initLayout({ app, sideGrip, bottomGrip }) {
  let { sideW, sideCollapsed, bottomH, bottomCollapsed } = readState();

  const clampSide = (w) => {
    const max = Math.floor(window.innerWidth * SIDE_MAX_FRACTION);
    return Math.min(Math.max(Math.round(w), SIDE_MIN), Math.max(SIDE_MIN, max));
  };
  const clampBottom = (h) => {
    const max = Math.floor(window.innerHeight * BOTTOM_MAX_FRACTION);
    return Math.min(Math.max(Math.round(h), BOTTOM_MIN), Math.max(BOTTOM_MIN, max));
  };

  const apply = () => {
    app.style.setProperty('--side-w', `${Math.round(sideW)}px`);
    app.style.setProperty('--bottom-h', `${Math.round(bottomH)}px`);
    app.dataset.side = sideCollapsed ? 'collapsed' : 'expanded';
    app.dataset.bottom = bottomCollapsed ? 'collapsed' : 'expanded';
  };

  const persist = () => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          sideW: Math.round(sideW),
          sideCollapsed,
          bottomH: Math.round(bottomH),
          bottomCollapsed,
        })
      );
    } catch {
      // storage unavailable — session-only layout
    }
  };

  let sideDrag = null;
  sideGrip.addEventListener('pointerdown', (event) => {
    if (sideCollapsed || event.button !== 0) return;
    sideDrag = { startX: event.clientX, startW: sideW };
    try {
      sideGrip.setPointerCapture(event.pointerId);
    } catch {
      // capture unsupported — listeners on the grip still track
    }
    document.body.classList.add('col-resizing');
    event.preventDefault();
  });

  let bottomDrag = null;
  bottomGrip.addEventListener('pointerdown', (event) => {
    if (bottomCollapsed || event.button !== 0) return;
    bottomDrag = { startY: event.clientY, startH: bottomH };
    try {
      bottomGrip.setPointerCapture(event.pointerId);
    } catch {
      // capture unsupported — listeners on the grip still track
    }
    document.body.classList.add('row-resizing');
    event.preventDefault();
  });

  sideGrip.addEventListener('pointermove', (event) => {
    if (!sideDrag) return;
    sideW = clampSide(sideDrag.startW + (event.clientX - sideDrag.startX));
    apply();
  });
  bottomGrip.addEventListener('pointermove', (event) => {
    if (!bottomDrag) return;
    bottomH = clampBottom(bottomDrag.startH - (event.clientY - bottomDrag.startY));
    apply();
  });

  const endDrag = (event) => {
    if (!sideDrag && !bottomDrag) return;
    sideDrag = null;
    bottomDrag = null;
    for (const grip of [sideGrip, bottomGrip]) {
      try {
        grip.releasePointerCapture(event.pointerId);
      } catch {
        // not captured by this grip
      }
    }
    document.body.classList.remove('col-resizing', 'row-resizing');
    persist();
  };
  sideGrip.addEventListener('pointerup', endDrag);
  sideGrip.addEventListener('pointercancel', endDrag);
  bottomGrip.addEventListener('pointerup', endDrag);
  bottomGrip.addEventListener('pointercancel', endDrag);

  sideGrip.addEventListener('dblclick', () => {
    sideW = SIDE_DEFAULT;
    sideCollapsed = false;
    apply();
    persist();
  });
  bottomGrip.addEventListener('dblclick', () => {
    bottomH = BOTTOM_DEFAULT;
    bottomCollapsed = false;
    apply();
    persist();
  });

  // Keep the islands inside bounds when the window shrinks.
  window.addEventListener('resize', () => {
    if (!sideCollapsed) sideW = clampSide(sideW);
    if (!bottomCollapsed) bottomH = clampBottom(bottomH);
    apply();
  });

  const toggleSide = (collapsed = !sideCollapsed) => {
    sideCollapsed = collapsed;
    apply();
    persist();
  };
  const toggleBottom = (collapsed = !bottomCollapsed) => {
    bottomCollapsed = collapsed;
    apply();
    persist();
  };

  sideW = clampSide(sideW);
  bottomH = clampBottom(bottomH);
  apply();

  return {
    toggleSide,
    toggleBottom,
    setSideCollapsed(value) {
      sideCollapsed = value;
      apply();
      persist();
    },
    setBottomCollapsed(value) {
      bottomCollapsed = value;
      apply();
      persist();
    },
    isSideCollapsed: () => sideCollapsed,
    isBottomCollapsed: () => bottomCollapsed,
  };
}
