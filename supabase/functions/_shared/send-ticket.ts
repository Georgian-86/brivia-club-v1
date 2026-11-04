// Sends a confirmed registration's ticket once (D-166). Used by event-ticket (free events), razorpay-verify and
// razorpay-webhook (paid events, after confirm_event_payment). admin: a service-role client.
//
// Once only: the row is claimed with UPDATE ... WHERE ticket_sent_at IS NULL (and status = 'confirmed'), so concurrent
// callers (the browser's verify and Razorpay's webhook) never send twice. A failed send releases the claim, so the next
// call retries. Without RESEND_API_KEY nothing is sent and the claim is released.
//
// Secrets: RESEND_API_KEY; optional TICKET_FROM (default "The Brivia Club <tickets@thebriviaclub.live>"; the domain must
// be verified in Resend).
import { ticketEmail, ticketCode, base64Utf8 } from './ticket-email.js';

type Admin = any;
export type TicketResult = { sent: boolean; reason?: string };

export const sendTicket = async (admin: Admin, eventId: string, memberId: string): Promise<TicketResult> => {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('TICKET_FROM') || 'The Brivia Club <tickets@thebriviaclub.live>';
  const { data: current } = await admin.from('event_rsvp').select('status,ticket_code,ticket_sent_at')
    .eq('event_id', eventId).eq('member_id', memberId).maybeSingle();
  if (!current || current.status !== 'confirmed') return { sent: false, reason: 'not_confirmed' };
  if (current.ticket_sent_at) return { sent: false, reason: 'already_sent' };
  if (!key) return { sent: false, reason: 'email_not_configured' };

  const code = current.ticket_code || ticketCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32);
  const { data: claimed, error: claimError } = await admin.from('event_rsvp')
    .update({ ticket_sent_at: new Date().toISOString(), ticket_code: code })
    .eq('event_id', eventId).eq('member_id', memberId).eq('status', 'confirmed').is('ticket_sent_at', null)
    .select('event_id');
  if (claimError) return { sent: false, reason: 'claim_failed' };
  if (!claimed?.length) return { sent: false, reason: 'already_sent' };
  const release = () => admin.from('event_rsvp').update({ ticket_sent_at: null }).eq('event_id', eventId).eq('member_id', memberId);

  try {
    const [{ data: event }, { data: profile }, { data: user }] = await Promise.all([
      admin.from('club_event').select('id,title,starts_at,ends_at,venue_name,venue_area,venue_address,map_url,image_url,fee_inr,cancelled_at').eq('id', eventId).maybeSingle(),
      admin.from('profiles').select('name,full_name').eq('id', memberId).maybeSingle(),
      admin.auth.admin.getUserById(memberId),
    ]);
    const email = user?.user?.email;
    if (!event || event.cancelled_at || !email) { await release(); return { sent: false, reason: 'missing_details' }; }
    const mail = ticketEmail({ event, member: { name: profile?.full_name || profile?.name }, code, paidInr: event.fee_inr || 0 });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': `ticket-${eventId}-${memberId}` },
      body: JSON.stringify({
        from, to: [email], subject: mail.subject, html: mail.html, text: mail.text,
        attachments: [{ filename: 'brivia-invitation.ics', content: base64Utf8(mail.ics), content_type: 'text/calendar' }],
        tags: [{ name: 'kind', value: 'event_ticket' }],
      }),
    });
    if (!res.ok) { await release(); return { sent: false, reason: `send_failed_${res.status}` }; }
    return { sent: true };
  } catch {
    await release();
    return { sent: false, reason: 'send_failed' };
  }
};
