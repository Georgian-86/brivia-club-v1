// The event ticket email (D-183): an invitation in the club's colours (blush paper, a deep wine ticket with a champagne
// frame, serif type), a plain-text twin, and a calendar invite (.ics). Pure functions, shared by the Edge Functions
// (event-ticket, razorpay-verify, razorpay-webhook) and the Node unit tests (tests/unit/event-ticket-email.test.mjs).
// Email clients ignore most CSS: the layout is tables with inline styles; the gradient has a solid fallback colour.

export const APP_URL = 'https://thebriviaclub.com';
const C = {
  blush: '#fcf2f2', blushDeep: '#f6dde3', rose: '#efc4d0', peach: '#f9e3d6',
  wine: '#5e0b28', wineDeep: '#430416', oxblood: '#4c1315', cream: '#fffaf1', champagne: '#e8c9a6', ink: '#291d1b', soft: '#6b5a57',
};
const SERIF = "'Bodoni Moda', 'Didot', 'Bodoni 72', Georgia, 'Times New Roman', serif";
const SANS = "'Instrument Sans', 'Helvetica Neue', Arial, sans-serif";

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// BRV- and six characters with no look-alikes (no I, O, 0 or 1). random: () => [0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ticketCode = (random = Math.random) => `BRV-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length]).join('')}`;

// "Saturday, 8 November 2026" and "7:00 PM – 10:00 PM IST" (events are in Indian time, D-121).
const IST = 'Asia/Kolkata';
export const whenLines = (startsAt, endsAt) => {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return { date: 'Date to be announced', time: '' };
  const date = start.toLocaleDateString('en-GB', { timeZone: IST, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const t = (d) => d.toLocaleTimeString('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit' });
  // D-198: times are optional; an untimed start is stored at 00:00 IST and an untimed end at 23:59 IST.
  const hhmm = (d) => d.toLocaleTimeString('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const startTimed = hhmm(start) !== '00:00';
  const end = endsAt ? new Date(endsAt) : null;
  if (!end || Number.isNaN(end.getTime())) return { date, time: startTimed ? `${t(start)} IST` : 'All day' };
  const endTimed = hhmm(end) !== '23:59';
  const day = (d) => d.toLocaleDateString('en-CA', { timeZone: IST });
  if (day(end) !== day(start)) {
    // D-197: a multi-day event, "Saturday, 8 November – Monday, 10 November 2026" and "7:00 PM, 8 Nov – 10:00 PM, 10 Nov IST".
    const long = (d, year) => `${d.toLocaleDateString('en-GB', { timeZone: IST, weekday: 'long' })}, ${d.toLocaleDateString('en-GB', { timeZone: IST, day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) })}`;
    const short = (d) => d.toLocaleDateString('en-GB', { timeZone: IST, day: 'numeric', month: 'short' });
    const sameYear = start.toLocaleDateString('en-GB', { timeZone: IST, year: 'numeric' }) === end.toLocaleDateString('en-GB', { timeZone: IST, year: 'numeric' });
    const from = startTimed ? `${t(start)}, ${short(start)}` : short(start);
    const to = endTimed ? `${t(end)}, ${short(end)}` : short(end);
    return { date: `${long(start, !sameYear)} – ${long(end, true)}`, time: startTimed || endTimed ? `${from} – ${to} IST` : 'All day' };
  }
  if (startTimed && endTimed) return { date, time: `${t(start)} – ${t(end)} IST` };
  if (startTimed) return { date, time: `From ${t(start)} IST` };
  if (endTimed) return { date, time: `Until ${t(end)} IST` };
  return { date, time: 'All day' };
};

// A calendar invite (RFC 5545): UTC times, escaped text, CRLF lines folded at 75 octets.
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsTime = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => {
  const out = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};
export const ticketIcs = ({ event, code, now = new Date() }) => {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 2 * 3600e3);
  const place = [event.venue_name, event.venue_address || event.venue_area].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Brivia Club//Event ticket//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${code}@thebriviaclub.live`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    place ? `LOCATION:${icsText(place)}` : null,
    `DESCRIPTION:${icsText(`Your Brivia Club ticket: ${code}. ${APP_URL}/app.html?view=events&event=${event.id}`)}`,
    `URL:${APP_URL}/app.html?view=events&event=${event.id}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold).join('\r\n') + '\r\n';
};

const feeLine = (paidInr) => (Number(paidInr) > 0 ? `Paid · ₹${Number(paidInr).toLocaleString('en-IN')}` : 'Free entry');
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const httpsOnly = (url) => (/^https:\/\//.test(String(url || '')) ? String(url) : '');

// event: club_event row (title, starts_at, ends_at, venue_name, venue_area, venue_address, map_url, image_url, id,
// custom_category, category). member: { name }. paidInr: the fee paid (0 for a free event).
export const ticketEmail = ({ event, member, code, paidInr = 0 }) => {
  const { date, time } = whenLines(event.starts_at, event.ends_at);
  const where = event.venue_name || 'Venue to be announced';
  const area = event.venue_address || event.venue_area || '';
  const eventUrl = `${APP_URL}/app.html?view=events&event=${encodeURIComponent(event.id)}`;
  const mapUrl = httpsOnly(event.map_url);
  const poster = httpsOnly(event.image_url);
  const guest = String(member?.name || '').trim() || 'Brivia member';
  const subject = `Your ticket: ${event.title}`;
  const e = escapeHtml;
  const row = (label, value, extra = '') => `<tr><td style="padding:0 0 14px;font-family:${SANS};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${C.champagne};">${e(label)}</td></tr>
<tr><td style="padding:0 0 20px;font-family:${SERIF};font-size:19px;line-height:1.35;color:${C.cream};">${value}${extra}</td></tr>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.blush};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your seat is confirmed. ${e(event.title)} · ${e(date)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.blush}" style="background:${C.blush};background-image:linear-gradient(160deg,${C.blush} 0%,${C.blushDeep} 45%,${C.peach} 100%);">
<tr><td align="center" style="padding:36px 14px 44px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
  <tr><td align="center" style="padding:0 0 6px;font-family:${SERIF};font-size:30px;color:${C.wine};"><i style="font-size:18px;">the</i> Brivia Club</td></tr>
  <tr><td align="center" style="padding:0 0 26px;font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.soft};">Your invitation</td></tr>
  <tr><td style="padding:0 6px 22px;font-family:${SERIF};font-size:22px;line-height:1.4;color:${C.ink};">Dear ${e(firstName(guest))},<br><span style="font-size:17px;color:${C.soft};">your seat is confirmed. We can't wait to see you there.</span></td></tr>
  ${poster ? `<tr><td style="padding:0 0 0;"><img src="${e(poster)}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border-radius:18px 18px 0 0;"></td></tr>` : ''}
  <tr><td bgcolor="${C.wine}" style="background:${C.wine};background-image:linear-gradient(160deg,${C.wine} 0%,${C.wineDeep} 100%);border:1px solid ${C.champagne};border-radius:${poster ? '0 0 18px 18px' : '18px'};padding:10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid rgba(232,201,166,.45);border-radius:12px;">
      <tr><td style="padding:30px 28px 6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:3.2px;text-transform:uppercase;color:${C.champagne};">Admit one</td></tr>
          <tr><td style="padding:0 0 26px;font-family:${SERIF};font-size:34px;line-height:1.12;color:${C.cream};">${e(event.title)}</td></tr>
          ${row('When', `${e(date)}${time ? `<br><span style="font-size:16px;color:${C.champagne};">${e(time)}</span>` : ''}`)}
          ${row('Where', e(where), area ? `<br><span style="font-size:16px;color:${C.champagne};">${e(area)}</span>` : '')}
          ${row('Guest', e(guest))}
        </table>
      </td></tr>
      <tr><td style="padding:0 18px;"><div style="border-top:2px dashed rgba(232,201,166,.55);height:0;line-height:0;font-size:0;">&nbsp;</div></td></tr>
      <tr><td style="padding:18px 28px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${SANS};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${C.champagne};">Ticket<br><span style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:20px;letter-spacing:4px;color:${C.cream};">${e(code)}</span></td>
          <td align="right" style="font-family:${SANS};font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${C.champagne};">${e(feeLine(paidInr))}</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:28px 0 8px;">
    <a href="${e(eventUrl)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${C.wine};color:${C.cream};font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;text-decoration:none;">View event</a>
    ${mapUrl ? `&nbsp;&nbsp;<a href="${e(mapUrl)}" style="display:inline-block;padding:13px 24px;border-radius:999px;border:1px solid ${C.wine};color:${C.wine};font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;text-decoration:none;">Directions</a>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:14px 18px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.soft};">A calendar invite is attached. Show this email or your ticket code at the door.</td></tr>
  <tr><td align="center" style="padding:30px 18px 0;font-family:${SERIF};font-size:15px;font-style:italic;color:${C.wine};">Good people. Better places.</td></tr>
  <tr><td align="center" style="padding:8px 18px 0;font-family:${SANS};font-size:11px;letter-spacing:1.2px;color:${C.soft};"><a href="${APP_URL}" style="color:${C.soft};text-decoration:none;">thebriviaclub.live</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [
    `the Brivia Club · Your invitation`, '',
    `Dear ${firstName(guest)}, your seat is confirmed. We can't wait to see you there.`, '',
    `ADMIT ONE: ${event.title}`,
    `When: ${date}${time ? `, ${time}` : ''}`,
    `Where: ${where}${area ? `, ${area}` : ''}`,
    `Guest: ${guest}`,
    `Ticket: ${code} · ${feeLine(paidInr)}`, '',
    `View event: ${eventUrl}`,
    mapUrl ? `Directions: ${mapUrl}` : null,
    '', 'A calendar invite is attached. Show this email or your ticket code at the door.',
  ].filter((l) => l !== null).join('\n');
  return { subject, html, text, ics: ticketIcs({ event, code }) };
};

// UTF-8 text to base64 (Resend attachments), in Deno and Node alike.
export const base64Utf8 = (text) => {
  const bytes = new TextEncoder().encode(String(text));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
