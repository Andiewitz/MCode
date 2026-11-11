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

export const dotsIcon = svg(
  '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  15
);

export const clockIcon = svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 14, 1.8);
