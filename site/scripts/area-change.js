// Change your area from Edit profile (founder, D-092; it replaces "Change your area: coming soon"). The same server
// calls as signup: set_home_city (a picked city) and set_home_location (the browser's location, snapped to a ~2 km
// cell in SQL; the coordinates are never stored). The server allows 3 changes per 24 h (PT429, HTTP 429). Pure: copy
// and the reading of a call's answer only.
export const AREA_HELPER = 'Other members see a rounded distance or your city, never your exact location. You can change your area up to 3 times a day.';
export const AREA_CHANGED = (name) => `Your area is now ${name}.`;
export const AREA_LIMIT = "You've changed your area 3 times today. Try again tomorrow.";
export const AREA_FAILED = "Your area couldn't be changed. Please try again.";
export const AREA_NO_MATCH = 'No city by that name yet. Try a nearby city.';

// { data, error, status } from setHomeCity / setHomeLocation -> the line to show.
export const areaChangeMessage = ({ data, error, status = 0 } = {}) => {
  if (error) return status === 429 || error?.code === 'PT429' ? AREA_LIMIT : AREA_FAILED;
  return typeof data === 'string' && data.trim() ? AREA_CHANGED(data.trim()) : AREA_FAILED;
};
