// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
// Proximity rings (spec §4). Raw coordinates never leave toCell: callers keep only the cell.
import { latLngToCell, cellToLatLng, greatCircleDistance } from 'h3-js';
import { loadConfig } from './config.js';

export function toCell(lat, lng, cfg) {
  return latLngToCell(lat, lng, cfg.h3Res);
}

export function distanceKm(cellA, cellB) {
  if (cellA === cellB) return 0;
  return greatCircleDistance(cellToLatLng(cellA), cellToLatLng(cellB), 'km');
}

export function ringOf(km, cfg) {
  const i = cfg.rings.findIndex((upper) => km <= upper);
  return i === -1 ? cfg.rings.length - 1 : i;
}

/** Rounded, privacy-safe distance label (R3). The ring-0 label follows cfg.rings[0]. */
export function distanceBand(km, ring, placeLabel, cfg = loadConfig()) {
  const approx = `~${Math.round(km)} km`;
  switch (ring) {
    case 0: return `< ${cfg.rings[0]} km`;
    case 1: return approx;
    case 2:
    case 3: return placeLabel ?? approx;
    case 4: return placeLabel ?? 'India';
    default: return 'Abroad';
  }
}
