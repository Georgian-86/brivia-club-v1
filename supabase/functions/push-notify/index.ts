// push-notify (D-134): sends Web Push for new Nearby notifications. Called by the signed-in app right after its location
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
const BAND: Record<string, string> = { '1': 'Under 1 km away', '3': '1–3 km away', '5': '3–5 km away', '10': '5–10 km away' };

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
  // Claim: this member's fresh notifications either way (they were told, or others were told about them), unread, not
  // yet pushed. The UPDATE ... RETURNING makes the claim atomic, so two concurrent calls never push the same one.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await admin.from('member_notification')
    .update({ push_sent_at: new Date().toISOString() })
    .is('push_sent_at', null).is('read_at', null).gte('created_at', since)
    .or(`user_id.eq.${uid},source_user_id.eq.${uid}`)
    .select('id,user_id,source_user_id,band,notification_type');
  if (claimError) return json(500, { error: 'claim' });
  if (!claimed?.length) return json(200, { sent: 0 });

  webpush.setVapidDetails(subject, pub, priv);
  const recipients = [...new Set(claimed.map((n) => n.user_id))];
  const sources = [...new Set(claimed.map((n) => n.source_user_id).filter(Boolean))];
  const [{ data: subs }, { data: people }] = await Promise.all([
    admin.from('push_subscription').select('endpoint,member_id,p256dh,auth').in('member_id', recipients),
    admin.from('profiles').select('id,name,photo_url').in('id', sources),
  ]);
  const nameOf = new Map((people || []).map((p) => [p.id, p]));
  let sent = 0;
  const gone: string[] = [];
  for (const n of claimed) {
    const who = nameOf.get(n.source_user_id) || { name: 'A Brivia member', photo_url: null };
    const payload = JSON.stringify({
      id: n.id, tag: n.id, type: n.notification_type,
      title: 'Someone crossed your path',
      body: `${who.name} is nearby${n.band && BAND[n.band] ? ` · ${BAND[n.band]}` : ''}. Discover who's around you.`,
      url: `/app.html?view=nearby&notification=${n.id}`,
    });
    for (const s of (subs || []).filter((x) => x.member_id === n.user_id)) {
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
