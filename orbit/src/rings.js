// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
// Proximity rings (spec §4). Raw coordinates never leave toCell: callers keep only the cell.
import { latLngToCell, cellToLatLng, greatCircleDistance } from 'h3-js';

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

export function distanceBand(km, ring, placeLabel) {
  const approx = `~${Math.round(km)} km`;
  switch (ring) {
    case 0: return '< 3 km';
    case 1: return approx;
    case 2:
    case 3: return placeLabel ?? approx;
    case 4: return placeLabel ?? 'India';
    default: return 'Abroad';
  }
}
