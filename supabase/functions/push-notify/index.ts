// push-notify (D-134): sends Web Push for new chat messages (D-245, body { to }: the sender's app right after a send),
// and for new Nearby notifications, and (D-151, 0043) likes and comments on a note,
// called by the liker's or commenter's app right after it saves. Called by the signed-in app right after its location
// pulse (nearby_pulse writes member_notification rows, 0030). Each notification is claimed once (push_sent_at set in the
// same UPDATE that selects it), never one already read, so no device gets a push for something viewed elsewhere and no
// notification is pushed twice. The push tag is the notification id: a device that shows it twice replaces it.
//
// Secrets (Supabase > Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https:).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
// D-138: the same words as the app (site/scripts/nearby-view.js crossingCopy). A band, never metres; the area is the
// town or city the receiver was in (0034).
const APART: Record<string, string> = { '1': 'within 1 km of each other', '3': 'about 1–3 km apart', '5': 'about 3–5 km apart', '10': 'about 5–10 km apart' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@thebriviaclub.live';
  if (!pub || !priv) return json(503, { error: 'push not configured' });

  // Who is calling: the member's own session token.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'auth' });
  const asMember = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who, error: whoError } = await asMember.auth.getUser(token);
  if (whoError || !who?.user?.id) return json(401, { error: 'auth' });
  const uid = who.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false } });
  webpush.setVapidDetails(subject, pub, priv);
  const gone: string[] = [];
  const pushTo = async (memberId: string, payload: string, topic: string) => {
    const { data: subs } = await admin.from('push_subscription').select('endpoint,member_id,p256dh,auth').eq('member_id', memberId);
    let n = 0;
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60, urgency: 'high', topic });
        n += 1;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
      }
    }
    return n;
  };

  // D-245: { to }: the caller just sent chat messages to `to`. Push the caller's newest messages to them (sent in the
  // last 2 minutes, not read, not unsent), unless either has blocked the other. One notification per sender (the tag),
  // replaced by the next, so a burst of messages is one notification, not ten.
  let body: { to?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body?.to) {
    const to = String(body.to);
    if (!/^[0-9a-f-]{36}$/i.test(to) || to === uid) return json(200, { sent: 0 });
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const [{ data: msgs }, { data: blocks }, { data: me }] = await Promise.all([
      admin.from('brivia_messages').select('id,body,message_type,created_at')
        .eq('sender_id', uid).eq('recipient_id', to).gte('created_at', recent).is('read_at', null).is('unsent_at', null)
        .order('created_at', { ascending: false }).limit(10),
      admin.from('brivia_blocks').select('blocker_id')
        .or(`and(blocker_id.eq.${uid},blocked_id.eq.${to}),and(blocker_id.eq.${to},blocked_id.eq.${uid})`).limit(1),
      admin.from('profiles').select('name').eq('id', uid).maybeSingle(),
    ]);
    if (!msgs?.length || blocks?.length) return json(200, { sent: 0 });
    const latest = msgs[0];
    const kind: Record<string, string> = { image: 'Sent a photo', gif: 'Sent a GIF', video: 'Sent a video', resume: 'Shared their resume', file: 'Sent a file' };
    const text = String(latest.body || '').replace(/\s+/g, ' ').trim();
    const line = text ? (text.length > 140 ? `${text.slice(0, 139)}…` : text) : (kind[latest.message_type] || 'Sent you a message');
    const first = String(me?.name || '').trim().split(/\s+/)[0] || 'A Brivia member';
    const payload = JSON.stringify({
      id: null, tag: `msg-${uid}`, type: 'message',
      title: msgs.length > 1 ? `${first} · ${msgs.length} new messages` : first,
      body: line,
      url: `/app.html?view=chat&chat=${uid}`,
    });
    const sent = await pushTo(to, payload, `m${uid.replace(/-/g, '').slice(0, 31)}`);
    if (gone.length) await admin.from('push_subscription').delete().in('endpoint', gone);
    return json(200, { sent });
  }

  // Claim: this member's fresh notifications either way (they were told, or others were told about them), unread, not
  // yet pushed. The UPDATE ... RETURNING makes the claim atomic, so two concurrent calls never push the same one.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await admin.from('member_notification')
    .update({ push_sent_at: new Date().toISOString() })
    .is('push_sent_at', null).is('read_at', null).gte('created_at', since)
    .or(`user_id.eq.${uid},source_user_id.eq.${uid}`)
    .select('id,user_id,source_user_id,band,notification_type,place_name,post_id,snippet,event_id');
  if (claimError) return json(500, { error: 'claim' });
  if (!claimed?.length) return json(200, { sent: 0 });

  const recipients = [...new Set(claimed.map((n) => n.user_id))];
  const sources = [...new Set(claimed.map((n) => n.source_user_id).filter(Boolean))];
  // D-250: an Admin's note reaches every member, so the devices are read 100 members at a time (a short URL each).
  const chunks: string[][] = [];
  for (let i = 0; i < recipients.length; i += 100) chunks.push(recipients.slice(i, i + 100));
  const [subParts, { data: people }] = await Promise.all([
    Promise.all(chunks.map((ids) => admin.from('push_subscription').select('endpoint,member_id,p256dh,auth').in('member_id', ids))),
    admin.from('profiles').select('id,name,photo_url').in('id', sources),
  ]);
  const subs = subParts.flatMap((part) => part.data || []);
  const nameOf = new Map((people || []).map((p) => [p.id, p]));
  let sent = 0;
  for (const n of claimed) {
    const who = nameOf.get(n.source_user_id) || { name: 'A Brivia member', photo_url: null };
    const first = String(who.name || '').trim().split(/\s+/)[0] || 'A Brivia member';
    const post = n.notification_type === 'post_like' || n.notification_type === 'post_comment' || n.notification_type === 'post_new' || n.notification_type === 'comment_reply';
    // D-203 (0060): someone registered for the member's event.
    const registered = n.notification_type === 'event_registered';
    const payload = JSON.stringify(registered ? {
      id: n.id, tag: n.id, type: n.notification_type,
      title: `${first} registered for ${n.snippet || 'your event'}`,
      body: 'Open Brivia to see who is coming.',
      url: `/app.html?view=events&event=${n.event_id}&notification=${n.id}`,
    } : post ? {
      id: n.id, tag: n.id, type: n.notification_type,
      // D-234 (0071): post_new, a connection shared a new note.
      // D-260 (0078): comment_reply, someone answered the member's comment.
      title: n.notification_type === 'post_like' ? `${first} liked your note` : n.notification_type === 'post_new' ? `${first} shared a new note` : n.notification_type === 'comment_reply' ? `${first} replied to your comment` : `${first} commented on your note`,
      body: (n.notification_type === 'post_comment' || n.notification_type === 'post_new' || n.notification_type === 'comment_reply') && n.snippet ? `“${n.snippet}”` : 'Open Brivia to see it.',
      url: `/app.html?view=posts&post=${n.post_id}&notification=${n.id}`,
    } : {
      id: n.id, tag: n.id, type: n.notification_type,
      title: 'Someone interesting crossed your path.',
      body: `You and ${first === 'A Brivia member' ? 'a Brivia member' : first} were ${APART[n.band] || 'close by'}${n.place_name ? `, near ${n.place_name}` : ''}. Discover who you crossed paths with.`,
      url: `/app.html?view=nearby&notification=${n.id}`,
    });
    for (const s of subs.filter((x) => x.member_id === n.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60, urgency: 'normal', topic: String(n.id).replace(/-/g, '').slice(0, 32) });
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);   // the device unsubscribed: forget it
      }
    }
  }
  if (gone.length) await admin.from('push_subscription').delete().in('endpoint', gone);
  return json(200, { sent });
});
