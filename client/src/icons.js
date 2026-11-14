// Tiny inline SVG icon set on a 24px grid (design reference voice:
// rounded caps, 1.7–2.2 stroke). Icons are drawn, not unicode glyphs,
// so they scale and theme with `currentColor`.

const svg = (paths, size = 15, stroke = 1.8) =>
  `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const menuIcon = svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 18, 1.7);

export const searchIcon = svg(
  '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  18,
  1.7
);

export const gitIcon = svg(
  '<circle cx="6" cy="5.5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="8.5" r="2.2"/><path d="M6 7.7v8.6M18 10.7c0 4.4-4 4.2-8 5.3-1.6.4-3 .9-4 1.8"/>',
  20,
  1.7
);

export const playIcon = (size = 20) =>
  svg('<path d="M7 5l12 7-12 7V5z"/>', size, 1.7);

export const pluginsIcon = svg(
  '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13v7M13 16.5h7"/>',
  20,
  1.7
);

export const terminalIcon = svg(
  '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 10l3 2.5L7 15M12.5 15H17"/>',
  20,
  1.7
);

export const problemsIcon = svg(
  '<path d="M12 4.5l9 15.5H3l9-15.5z"/><path d="M12 10v4M12 17v.01"/>',
  20,
  1.7
);

export const settingsIcon = svg(
  '<path d="M5 7h9M18 7h1M5 17h1M10 17h9"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  20,
  1.7
);

export const errorIcon = svg(
  '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'
);

export const warningIcon = svg(
  '<path d="M12 4.5l9 15.5H3l9-15.5z"/><path d="M12 10v4M12 17v.01"/>'
);

export const infoIcon = svg('<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.01"/>');

export const folderIcon = svg(
  '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'
);

export const folderOpenIcon = svg(
  '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'
);

export const fileIcon = svg(
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/>'
);

export const filePlusIcon = svg(
  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M12 11v6M9 14h6"/>'
);

export const closeIcon = svg('<path d="M6 6l12 12M18 6L6 18"/>', 15, 1.8);

export const chevronDownIcon = svg('<path d="M6 9l6 6 6-6"/>', 12, 2.2);

export const chevronRightIcon = svg('<path d="M9 6l6 6-6 6"/>', 12, 2.2);

export const collapseIcon = svg('<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>', 15, 1.8);

export const refreshIcon = svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>', 15, 1.8);

export const plusIcon = svg('<path d="M12 5v14M5 12h14"/>', 15, 1.8);

export const splitIcon = svg(
  '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v15"/>',
  15,
  1.8
);

export const dockBottomIcon = svg(
  '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 12h17"/>',
  15,
  1.8
);

export const dotsIcon = svg(
  '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  15
);

export const clockIcon = svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 14, 1.8);

// Official GitHub mark (filled, not stroked).
export const githubIcon =
  '<svg class="icon" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
