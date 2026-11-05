// event-ticket (D-183): the signed-in member asks for their own ticket after a free registration is confirmed (paid
// seats get theirs from razorpay-verify / razorpay-webhook). Body { event_id }. Sends once (send-ticket.ts claims it).
import { CORS, json, adminClient, callerId, UUID } from '../_shared/http.ts';
import { sendTicket } from '../_shared/send-ticket.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const uid = await callerId(req);
  if (!uid) return json(401, { error: 'auth' });
  const { event_id: eventId } = await req.json().catch(() => ({}));
  if (!UUID.test(String(eventId || ''))) return json(400, { error: 'event' });
  const result = await sendTicket(adminClient(), eventId, uid);
  return json(200, result);
});
