// Tiny inline SVG icon set. One 16px grid, one 1.5px stroke, one voice.
// Icons are drawn (not unicode glyphs) so they scale and theme with `currentColor`.

const svg = (paths, viewBox = '0 0 16 16') =>
  `<svg class="icon" viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const chevronIcon = svg('<path d="M6 3.5 10.5 8 6 12.5"/>');

export const folderIcon = svg(
  '<path d="M2.75 5.25a1.75 1.75 0 0 1 1.75-1.75h2.25l1.75 1.75h5a1.75 1.75 0 0 1 1.75 1.75v5.25a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V5.25z"/>'
);

export const fileIcon = svg(
  '<path d="M4 1.75h5.25L13 5.5v8.75H4V1.75z"/><path d="M9.25 1.75V5.5H13"/>'
);

export const closeIcon = svg('<path d="M4 4l8 8M12 4l-8 8"/>');

export const panelIcon = svg(
  '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M5.75 2.75v10.5"/>'
);

export const terminalIcon = svg(
  '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M4.5 6l2.5 2-2.5 2"/><path d="M8.25 10h3"/>'
);

export const explorerIcon = svg(
  '<path d="M1.75 4.5A1.75 1.75 0 0 1 3.5 2.75h2.25l1.5 1.5h5.25a1.75 1.75 0 0 1 1.75 1.75v5.5A1.75 1.75 0 0 1 12.5 13.25h-9a1.75 1.75 0 0 1-1.75-1.75V4.5z"/>'
);
