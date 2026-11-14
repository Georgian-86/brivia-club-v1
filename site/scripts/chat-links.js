// D-255 (founder 2026-11-14: "allow sending links as links in the chat and allow sending post or events from respective
// sections directly and clearly"). Pure helpers, unit-tested in tests/unit/chat-links.test.mjs; the DOM is in app.js.
//   linkifyHtml(text, escape): the message as HTML with every http(s) / www. link a real link (new tab, no opener, no
//     referrer), everything else escaped. Trailing punctuation stays outside the link.
//   sharedLinkIn(text): the first Brivia post or event link in a message, wherever it sits in the words, as
//     { kind: 'post' | 'event', id, rest } (rest: the words around it, the "Shared … on Brivia Club:" lead removed).
//     The card is always read from the database by id, never trusted from the link.

const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAIL_RE = /[.,;:!?'")\]}>]+$/;

const splitLink = (raw) => {
  const trail = (raw.match(TRAIL_RE) || [''])[0];
  return { link: trail ? raw.slice(0, -trail.length) : raw, trail };
};

export const hrefFor = (link) => {
  const href = /^www\./i.test(link) ? `https://${link}` : link;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
};

export const linkifyHtml = (text, escape) => {
  const value = String(text ?? '');
  let out = '';
  let at = 0;
  for (const match of value.matchAll(LINK_RE)) {
    const { link, trail } = splitLink(match[0]);
    const href = link && hrefFor(link);
    if (!href) continue;
    out += escape(value.slice(at, match.index));
    out += `<a class="message-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer nofollow">${escape(link)}</a>${escape(trail)}`;
    at = match.index + match[0].length;
  }
  return out + escape(value.slice(at));
};

const POST_RE = /https?:\/\/[^\s/]+\/explore\.html\?post=([A-Za-z0-9-]{1,64})\S*/i;
const EVENT_RE = /https?:\/\/[^\s/]+\/app\.html\?(?:[^\s#]*&)?event=([A-Za-z0-9-]{1,64})\S*/i;
const LEAD_RE = /^\s*Shared (?:a post|an event) with you on Brivia Club:\s*/i;

export const sharedPostMessage = (url) => `Shared a post with you on Brivia Club: ${url}`;
export const sharedEventMessage = (url) => `Shared an event with you on Brivia Club: ${url}`;

export const sharedLinkIn = (text) => {
  const value = String(text ?? '');
  const post = POST_RE.exec(value);
  const event = EVENT_RE.exec(value);
  const hit = post && (!event || post.index <= event.index) ? { kind: 'post', m: post } : event ? { kind: 'event', m: event } : null;
  if (!hit) return null;
  const { link, trail } = splitLink(hit.m[0]);
  const id = hit.kind === 'post' ? POST_RE.exec(link)?.[1] : EVENT_RE.exec(link)?.[1];
  if (!id) return null;
  const rest = (value.slice(0, hit.m.index) + trail + value.slice(hit.m.index + hit.m[0].length)).replace(LEAD_RE, '').replace(/[ \t]{2,}/g, ' ').trim();
  return { kind: hit.kind, id, rest };
};
