// Inline stroke icons on a 24x24 grid. Original simple shapes; no third-party artwork.
// Each value is SVG child markup drawn with stroke="currentColor" by the caller.

export const ICONS = {
  outdoor: '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 3.6l-1.1 1.1"/><path d="M9 19.5h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4-.8A3.9 3.9 0 0 0 9 19.5z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  fan: '<circle cx="12" cy="12" r="10.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c-.6-2.6.2-5 2.6-5.6 1.9-.4 2.8 1.6 1.6 3.2-1 1.3-2.6 2-4.2 2.4zM13.4 12.8c2.5.8 4.2 2.7 3.4 5-.6 1.8-2.8 1.6-3.5-.3-.6-1.5-.3-3.2.1-4.7zM10.6 12.8c-1.9 1.8-4.4 2.4-5.9.6-1.2-1.5.1-3.2 2.1-3 1.6.2 2.9 1.2 3.8 2.4z"/>',
  thermometer: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/><circle cx="12" cy="16.8" r="1.2"/>',
  house: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
  moon: '<path d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8 8 0 1 0 10.3 10.3z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="12.5" rx="2"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M3 12.5h18"/>',
  bypass: '<path d="M3 17h4V8h10v9h4"/><path d="M3 17h18"/><circle cx="12" cy="8" r="1.4"/>',
  // navigation
  forecast: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.3-.6A3.8 3.8 0 0 0 9 19z"/>',
  inverter: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7 12c1.2-3 2.3-3 3.5 0s2.3 3 3.5 0 2.3-3 3.5 0"/>',
  attic: '<path d="M2.5 13 12 4.5l9.5 8.5"/><path d="M5 11v8.5h14V11"/><path d="M9.5 13h5"/>',
  security: '<path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  bms: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  mvhr: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m12 7.5 4.5 4.5-4.5 4.5L7.5 12z"/>',
  pump: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5v7l5.5-3.5z"/>',
  boiler: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M12 17.5c-2 0-3-1.3-3-2.9 0-1.8 1.6-2.6 2-4.6 1.6 1 4 3 4 4.8 0 1.5-1 2.7-3 2.7z"/>',
  car: '<path d="M4 16.5V12l2-5h12l2 5v4.5z"/><path d="M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  home: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11h13V9"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.6 3-5.2 4-9.4 3 2 8 6 8 9.6 0 3-2.4 5.4-6 5.4z"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
  drop: '<path d="M12 3c3 4 6 7.2 6 10.7a6 6 0 0 1-12 0C6 10.2 9 7 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
ICONS.fan_nav = ICONS.fan;

// Standalone <svg> for HTML contexts (navigation, header).
export function iconSvg(name, size = 24, label = "") {
  const body = ICONS[name] || ICONS.link;
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg ${aria} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// <g> for use inside the diagram SVG, scaled from 24 to size at (x, y).
export function iconGroup(name, x, y, size, color, width = 1.8) {
  const s = size / 24;
  return `<g class="icon" transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${(width / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</g>`;
}
