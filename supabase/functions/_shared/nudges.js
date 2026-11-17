// D-266: the daily nudge pushes, in the founder's own words (2026-11-14). Four a day, India time (IST, UTC+5:30):
// three every 3 hours through the day, then one at night. Shared by the push-nudge Edge Function and its unit test.
// The pg_cron jobs (0082) post { slot } at these times; the function sends that slot's words to every device that has
// Brivia notifications on, as a phone notification (the system notification screen), even when Brivia is open.
//
// Do not "correct" the spelling: it is the founder's Hinglish, kept on purpose.
export const NUDGES = Object.freeze([
  Object.freeze({ slot: 'noon', ist: '12:00', cron: '30 6 * * *', title: 'Bore horhe ho?', body: 'Brivia pr swipe krlo', url: '/app.html' }),
  Object.freeze({ slot: 'afternoon', ist: '15:00', cron: '30 9 * * *', title: 'Brivia Club', body: 'Brivia se Itni Jaldi Bore hogye?', url: '/app.html' }),
  Object.freeze({ slot: 'chai', ist: '18:00', cron: '30 12 * * *', title: 'Ek Kachori Do Chai', body: 'Brivia pr Swipe ho jaye', url: '/app.html' }),
  Object.freeze({ slot: 'night', ist: '21:30', cron: '0 16 * * *', title: 'Career ki Tension Horhi hai?', body: 'Brivia pr Referral Maanglo', url: '/app.html' }),
]);

export const nudgeFor = (slot) => NUDGES.find((n) => n.slot === slot) || null;

// The push payload the service worker (site/public/sw.js) shows. One tag per slot, so a re-run replaces the
// notification instead of stacking a second one.
export const nudgePayload = (slot) => {
  const n = nudgeFor(slot);
  if (!n) return null;
  return { id: null, tag: `nudge-${n.slot}`, type: 'nudge', title: n.title, body: n.body, url: n.url };
};
