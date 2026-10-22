// Original line icons for the HUD (24x24, currentColor). No emblems, insignia or brand marks.
// Usage: ic('shelter') -> '<svg class="ic"><use href="#iw-shelter"/></svg>'
const S = {
  people: '<circle cx="9" cy="7.2" r="2.9"/><path d="M3.6 19.5c0-3.4 2.4-6.1 5.4-6.1s5.4 2.7 5.4 6.1"/><circle cx="16.6" cy="8.4" r="2.3"/><path d="M15.4 13.5c2.9.2 5 2.6 5 6"/>',
  shelter: '<path d="M2.5 19.5h19"/><path d="M4.8 19.5v-6.2a7.2 7.2 0 0 1 14.4 0v6.2"/><path d="M10 19.5v-4.6h4v4.6"/>',
  lock: '<rect x="5" y="10.8" width="14" height="9.4" rx="1.4"/><path d="M8 10.8V8a4 4 0 0 1 8 0v2.8"/><path d="M12 14.4v2.2"/>',
  unlock: '<rect x="5" y="10.8" width="14" height="9.4" rx="1.4"/><path d="M8 10.8V8a4 4 0 0 1 7.6-1.8"/>',
  dome: '<path d="M3 19.5h18"/><path d="M6.4 19.5l1.4-3.2h8.4l1.4 3.2"/><path d="M6 13.6l9.4-5.4 2.2 3.8-9.4 5.4z"/><path d="M8.9 12l1.6 2.7M11.6 10.4l1.6 2.8"/>',
  sling: '<path d="M3 19.5h18"/><rect x="6.5" y="4.5" width="4.2" height="12.5" rx=".6"/><rect x="13.3" y="4.5" width="4.2" height="12.5" rx=".6"/>',
  arrow: '<path d="M12 2.8l2.6 4.4v9.6L12 19.4l-2.6-2.6V7.2z"/><path d="M9.4 13.6l-3.2 4.2M14.6 13.6l3.2 4.2"/><path d="M12 19.4v2.2"/>',
  jet: '<path class="f" d="M12 2.4l1.5 6.2 7.3 4.3v1.9l-7.1-1.9-.6 4.7 2.7 2v1.5L12 20.2l-3.8.9v-1.5l2.7-2-.6-4.7-7.1 1.9v-1.9l7.3-4.3z"/>',
  drone: '<path class="f" d="M12 3.5l8.6 13.6-3.4-1.1-1.1 3.3L12 17l-4.1 2.3-1.1-3.3-3.4 1.1z"/>',
  cruise: '<path class="f" d="M2.6 10.9h12.9l5.9 1.1-5.9 1.1H2.6z"/><path d="M5.2 10.9L3.4 7.8M5.2 13.1l-1.8 3.1M13.2 10.9l1.2-2M13.2 13.1l1.2 2"/>',
  ballistic: '<path class="f" d="M12 21.6l-2.7-4.4V4.6h5.4v12.6z"/><path d="M9.3 7.6L6.6 4.4M14.7 7.6l2.7-3.2"/>',
  check: '<path d="M4.5 12.6l4.8 4.8L19.6 7"/>',
  cross: '<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8"/>',
  base: '<path d="M5 20.5L10.2 3.5M13.8 3.5L19 20.5"/><path d="M12 5.5v2M12 10.5v2M12 15.5v2.5"/>',
  town: '<path d="M2.5 20h19"/><path d="M4.5 20v-9h5v9M9.5 20V4.5h6V20M15.5 20v-7.5h4V20"/><path d="M12 8h1M12 11h1M12 14h1"/>',
  warn: '<path d="M12 3.2l9.6 17H2.4z"/><path d="M12 9.6v5M12 17.2v.6"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  hexplus: '<path d="M12 2.6l8.2 4.7v9.4L12 21.4l-8.2-4.7V7.3z"/><path d="M12 8.4v7.2M8.4 12h7.2"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  play: '<path class="f" d="M7.5 5l11 7-11 7z"/>',
  target: '<circle cx="12" cy="12" r="6.8"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
  route: '<path d="M3.5 12h15M13.5 6.5L19 12l-5.5 5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.1 2"/>',
  siren: '<path d="M6 18.5v-6a6 6 0 0 1 12 0v6"/><path d="M3.5 18.5h17"/><path d="M12 2.8v2M4.2 6l1.4 1.4M19.8 6l-1.4 1.4"/>',
  radar: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.4"/><path d="M12 12l6.2-6"/>',
};

export function iconSprite() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(S)
    .map(([k, v]) => `<symbol id="iw-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</defs></svg>`;
}
export const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#iw-${name}"/></svg>`;
