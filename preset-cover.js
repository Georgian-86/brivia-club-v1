// Bundled preset covers and illustrations (cover-assets.js): same-site paths, never a third-party host. The same shape
// as brivia_is_preset_cover in the database (0003). Pure, so node can test it (supabase.js re-exports it).
export const isPresetCoverUrl = (value) => {
  const raw = String(value || '').trim();
  return !raw.includes('..') && /^\/(assets\/|Images\/Cover(%20| )images\/)[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(raw);
};
