// Active status for connections in chat (D-110, migration 0018). The member's own presence is touched on start, every
// minute while the tab is visible and on focus (the server writes it at most every 30 s); the same beat asks which of
// the member's connections are active (connection_presence answers true or false, never a time). Before 0018 the
// functions are missing: the loop stops quietly and nobody shows as active. A network error keeps the last state.
const MISSING = new Set(['PGRST202', '42883']);
const isMissing = (error) => Boolean(error) && (MISSING.has(error.code) || error.status === 404);

export const presenceDot = (active) => (active ? '<span class="presence-dot" aria-hidden="true"></span>' : '');

export const createPresence = ({
  touch, fetch, ids, onChange = () => {}, intervalMs = 60000,
  doc = globalThis.document, win = globalThis.window,
  setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms), clearIntervalFn = (id) => globalThis.clearInterval(id),
} = {}) => {
  let active = new Set();
  let timer = null;
  let stopped = false;
  const visible = () => !doc || doc.visibilityState === 'visible';
  const update = (next) => {
    const same = next.size === active.size && [...next].every((id) => active.has(id));
    active = next;
    if (!same) onChange(new Set(active));
  };
  const stop = () => {
    stopped = true;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    win?.removeEventListener?.('focus', beat);
    doc?.removeEventListener?.('visibilitychange', onVisible);
  };
  const giveUp = () => { stop(); update(new Set()); };
  const refresh = async () => {
    const list = (ids?.() || []).map(String).filter(Boolean).slice(0, 100);
    if (stopped || !list.length) { if (!list.length) update(new Set()); return; }
    const { data, error } = await fetch(list);
    if (isMissing(error)) { giveUp(); return; }
    if (error || !Array.isArray(data)) return;
    update(new Set(data.filter((row) => row?.active).map((row) => String(row.member_id))));
  };
  async function beat() {
    if (stopped || !visible()) return;
    const { error } = (await touch()) || {};
    if (isMissing(error)) { giveUp(); return; }
    await refresh();
  }
  function onVisible() { if (visible()) beat(); }
  const start = async () => {
    stopped = false;
    win?.addEventListener?.('focus', beat);
    doc?.addEventListener?.('visibilitychange', onVisible);
    timer = setIntervalFn(beat, intervalMs);
    await beat();
  };
  return { start, stop, refresh, isActive: (id) => active.has(String(id)) };
};
