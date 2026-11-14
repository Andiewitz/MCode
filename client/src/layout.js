// Layout controller for the islands shell:
//  - side island width (drag #side-grip), collapse state (Ctrl+B)
//  - bottom island height (drag #bottom-grip), collapse state (Ctrl+`)
//  - right sidebar width (drag #right-grip)
// All of it persists through localStorage.

const STORE_KEY = 'mcode.layout';
const SIDE_MIN = 200;
const SIDE_MAX_FRACTION = 0.6;
const SIDE_DEFAULT = 264;
const BOTTOM_MIN = 120;
const BOTTOM_MAX_FRACTION = 0.85;
const BOTTOM_DEFAULT = 236;
const RIGHT_MIN = 260;
const RIGHT_MAX_FRACTION = 0.7;
const RIGHT_DEFAULT = 440;

function readState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '');
    if (raw && typeof raw === 'object') {
      return {
        sideW: Number.isFinite(raw.sideW) ? raw.sideW : SIDE_DEFAULT,
        sideCollapsed: Boolean(raw.sideCollapsed),
        bottomH: Number.isFinite(raw.bottomH) ? raw.bottomH : BOTTOM_DEFAULT,
        bottomCollapsed: Boolean(raw.bottomCollapsed),
        rightW: Number.isFinite(raw.rightW) ? raw.rightW : RIGHT_DEFAULT,
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
    rightW: RIGHT_DEFAULT,
  };
}

export function initLayout({ app, sideGrip, bottomGrip, rightGrip }) {
  let { sideW, sideCollapsed, bottomH, bottomCollapsed, rightW } = readState();

  const clampSide = (w) => {
    // When the right sidebar is open, both islands must leave the editor a
    // usable minimum instead of overflowing the window.
    const rightSpace = app.dataset.right === 'expanded' ? Math.max(RIGHT_MIN, rightW) : 0;
    const maxBySpace = window.innerWidth - 44 - rightSpace - 220 - 12;
    const max = Math.min(Math.floor(window.innerWidth * SIDE_MAX_FRACTION), maxBySpace);
    return Math.min(Math.max(Math.round(w), SIDE_MIN), Math.max(SIDE_MIN, max));
  };
  const clampBottom = (h) => {
    const max = Math.floor(window.innerHeight * BOTTOM_MAX_FRACTION);
    return Math.min(Math.max(Math.round(h), BOTTOM_MIN), Math.max(BOTTOM_MIN, max));
  };
  const clampRight = (w) => {
    const sideSpace = app.dataset.side === 'expanded' ? sideW : 0;
    const maxBySpace = window.innerWidth - 44 - sideSpace - 220 - 12;
    const max = Math.min(Math.floor(window.innerWidth * RIGHT_MAX_FRACTION), maxBySpace);
    return Math.min(Math.max(Math.round(w), RIGHT_MIN), Math.max(RIGHT_MIN, max));
  };

  const apply = () => {
    app.style.setProperty('--side-w', `${Math.round(sideW)}px`);
    app.style.setProperty('--bottom-h', `${Math.round(bottomH)}px`);
    app.style.setProperty('--right-w', `${Math.round(rightW)}px`);
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
          rightW: Math.round(rightW),
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

  let rightDrag = null;
  rightGrip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    rightDrag = { startX: event.clientX, startW: rightW };
    try {
      rightGrip.setPointerCapture(event.pointerId);
    } catch {
      // capture unsupported — listeners on the grip still track
    }
    document.body.classList.add('col-resizing');
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
  rightGrip.addEventListener('pointermove', (event) => {
    if (!rightDrag) return;
    rightW = clampRight(rightDrag.startW - (event.clientX - rightDrag.startX));
    apply();
  });

  const endDrag = (event) => {
    if (!sideDrag && !bottomDrag && !rightDrag) return;
    sideDrag = null;
    bottomDrag = null;
    rightDrag = null;
    for (const grip of [sideGrip, bottomGrip, rightGrip]) {
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
  rightGrip.addEventListener('pointerup', endDrag);
  rightGrip.addEventListener('pointercancel', endDrag);

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
  rightGrip.addEventListener('dblclick', () => {
    rightW = RIGHT_DEFAULT;
    apply();
    persist();
  });

  // Keep the islands inside bounds when the window shrinks.
  const reflow = () => {
    // Right first, then left, then right again: each clamp depends on the
    // other island's current width.
    rightW = clampRight(rightW);
    sideW = clampSide(sideW);
    rightW = clampRight(rightW);
    if (!bottomCollapsed) bottomH = clampBottom(bottomH);
    apply();
  };

  window.addEventListener('resize', reflow);

  const toggleSide = (collapsed = !sideCollapsed) => {
    sideCollapsed = collapsed;
    reflow();
    persist();
  };
  const toggleBottom = (collapsed = !bottomCollapsed) => {
    bottomCollapsed = collapsed;
    apply();
    persist();
  };

  apply();
  reflow();

  return {
    toggleSide,
    toggleBottom,
    reflow,
    setSideCollapsed(value) {
      sideCollapsed = value;
      reflow();
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
