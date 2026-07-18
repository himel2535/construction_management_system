/** Lucide-style stroke icons — single source for Customers page */

const PATHS = {
  users:
    '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  userCheck:
    '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16 11l2 2 4-4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/>',
  calendarPlus:
    '<path d="M8 2v4M16 2v4M3 10h18M11 14h6M14 14v6"/><rect width="18" height="18" x="3" y="4" rx="2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pencil:
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4Z"/>',
  userPlus:
    '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  eye:
    '<path d="M2 12s3-7 10-7 10 7 10 7 10-7 10-7"/><circle cx="12" cy="12" r="3"/>',
  download:
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload:
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  filter:
    '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  rotateCcw: '<path d="M3 12a9 9 0 109-9 7.7 7.7 0 00-7.9-3.9"/><path d="M3 3v6h6"/>',
  building:
    '<path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18Z"/><path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2"/><path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  landmark:
    '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
  hardHat:
    '<path d="M2 18a1 1 0 001 1h18a1 1 0 001-1v-2a1 1 0 00-1-1H3a1 1 0 00-1 1v2z"/><path d="M12 2v4"/><path d="M4.93 6.93l1.41 1.41"/><path d="M19.07 6.93l-1.41 1.41"/><path d="M12 6a4 4 0 00-4 4v2h8v-2a4 4 0 00-4-4z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  folder: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  mapPin:
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0Z"/><circle cx="12" cy="10" r="3"/>',
  calendar:
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  fileText:
    '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  layers:
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  wallet:
    '<path d="M19 7V4a1 1 0 00-1-1H5a2 2 0 000 4h15a1 1 0 011 1v4h-3a2 2 0 000 4h3a1 1 0 001-1v-2a1 1 0 00-1-1"/><path d="M3 5v14a2 2 0 002 2h15a1 1 0 001-1v-4"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  banknote:
    '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  package:
    '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 00-3.48 0l-8 14A2 2 0 004 22h16a2 2 0 001.73-3Z"/><path d="M12 9v4M12 17h.01"/>',
  activity:
    '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  checkCircle:
    '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
};

/**
 * @param {string} name
 * @param {{ size?: number, className?: string, strokeWidth?: number }} [opts]
 */
export function icon(name, opts = {}) {
  const { size = 20, className = "icon", strokeWidth = 2 } = opts;
  const body = PATHS[name] || PATHS.users;
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
