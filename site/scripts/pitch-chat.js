// Pitch threads (D-112): a pitch (a connection request with a note) shows in the receiver's Chat as a message request.
// Accept opens the chat without connecting. Pure helpers: markup strings only, no DOM access. The "Not connected" chip
// in an open thread's head is the caller's job. Wording rule: connect, request; never dating-app words.

export const PITCH_COPY = Object.freeze({
  sectionTitle: 'Message requests',
  label: 'Message request',
  notConnectedYet: 'Not connected yet',
  waiting: 'Waiting for them to accept',
  accept: 'Accept',
  decline: 'Decline',
  endChat: 'End chat',
  notConnected: 'Not connected',
  noLongerOpen: 'That request is no longer open.',
  updateFailed: 'That request could not be updated. Please try again.',
});

const FALLBACK_NAME = 'A Brivia member';

// my_pitch_threads() rows (snake_case) to the client shape. Rows without other_id or with a blank note are dropped.
export const pitchRowsFromRpc = (data) => (Array.isArray(data) ? data : []).flatMap((r) => {
  const otherId = String(r?.other_id || '');
  const note = String(r?.note || '').trim();
  if (!otherId || !note) return [];
  return [{ otherId, direction: r.direction === 'out' ? 'out' : 'in', note, createdAt: r.created_at || '', chatOpen: r.chat_open === true }];
});

export const pitchThreadModel = (row, person) => ({
  otherId: String(row?.otherId || ''),
  direction: row?.direction === 'out' ? 'out' : 'in',
  note: String(row?.note || '').trim(),
  createdAt: row?.createdAt || '',
  chatOpen: row?.chatOpen === true,
  name: String(person?.name || '').trim() || FALLBACK_NAME,
  state: row?.chatOpen === true ? 'open' : row?.direction === 'out' ? 'waiting' : 'request',
});

export const pitchThreadMarkup = (m, { escapeHtml }) => {
  const mine = m.direction === 'out';
  const bubble = `<div class="pitch-bubble pitch-bubble--${mine ? 'me' : 'them'}"><p class="pitch-note">${escapeHtml(m.note)}</p></div>`;
  if (m.state === 'open') return bubble;
  if (m.state === 'waiting') return `${bubble}<p class="pitch-status">${escapeHtml(PITCH_COPY.waiting)}</p>`;
  return `<section class="pitch-request" aria-label="${escapeHtml(PITCH_COPY.label)} from ${escapeHtml(m.name)}">`
    + bubble
    + `<p class="pitch-status">${escapeHtml(PITCH_COPY.notConnectedYet)}</p>`
    + '<div class="pitch-actions">'
    + `<button type="button" class="pitch-button pitch-button--accept" data-pitch-action="accept">${escapeHtml(PITCH_COPY.accept)}</button>`
    + `<button type="button" class="pitch-button pitch-button--decline" data-pitch-action="decline">${escapeHtml(PITCH_COPY.decline)}</button>`
    + '</div></section>';
};
