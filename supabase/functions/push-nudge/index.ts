// push-nudge (D-266): the four daily nudges (supabase/functions/_shared/nudges.js), sent to every device with Brivia
// notifications on. Called only by the pg_cron jobs in 0082 (pg_net POST { slot }), never by the app.
//
// Deployed with verify_jwt OFF: the caller proves itself with the x-nudge-secret header, which must equal the
// NUDGE_SECRET Edge Function secret (the same value sits in Supabase Vault as 'push_nudge_secret' for the cron jobs).
// Secrets: NUDGE_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (the last three are push-notify's).
//
// Rules: every subscribed device gets it as a phone notification (the system notification screen, never an in-app
// notice), even if the member has Brivia open (sw.js always shows type 'nudge'); the push tag is nudge-<slot>, so a
// repeat replaces only that slot's line; a device the push service says is gone (404/410) is forgotten.
// The member's "Push notification sound" switch is honoured by the service worker, as for every push.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { nudgePayload } from '../_shared/nudges.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const secret = Deno.env.get('NUDGE_SECRET') || '';
  if (secret.length < 24 || !same(req.headers.get('x-nudge-secret') || '', secret)) return json(401, { error: 'auth' });
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return json(503, { error: 'push not configured' });

  let body: { slot?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const payload = nudgePayload(String(body?.slot || ''));
  if (!payload) return json(400, { error: 'slot' });

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@thebriviaclub.live', pub, priv);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const text = JSON.stringify(payload);
  const topic = payload.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const gone: string[] = [];
  let sent = 0;
  for (let from = 0; ; from += 500) {
    const { data: subs, error } = await admin.from('push_subscription').select('endpoint,member_id,p256dh,auth')
      .order('endpoint').range(from, from + 499);
    if (error) return json(500, { error: 'read', sent });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, text, { TTL: 2 * 60 * 60, urgency: 'normal', topic });
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
      }
    }
    if (!subs || subs.length < 500) break;
  }
  for (let i = 0; i < gone.length; i += 100) await admin.from('push_subscription').delete().in('endpoint', gone.slice(i, i + 100));
  return json(200, { slot: body.slot, sent, forgotten: gone.length });
});
