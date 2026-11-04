set lock_timeout = '5s';
-- 0047_event_tickets_payments.sql: Razorpay payments for paid events and an emailed invitation ticket for every
-- confirmed registration (founder request 2026-11-04, D-166: "when a user registers for an event after making payment,
-- a music effect should come and the user should get his ticket of the event on his mail with some aesthetic theme
-- colored invitation"; gateway: Razorpay; email: Resend). Applied after 0046 (README "## 0047"). 0001-0046 are frozen.
--
-- The money and the email are handled by Edge Functions (service role): razorpay-order, razorpay-verify,
-- razorpay-webhook and event-ticket. This migration only gives them the columns they need on event_rsvp:
--   payment_order_id  the Razorpay order created for this hold (the amount is the event's fee, set by the server);
--   ticket_code       the short code printed on the ticket (BRV-XXXXXX), set when the ticket is first sent;
--   ticket_sent_at    claimed atomically (UPDATE ... WHERE ticket_sent_at IS NULL) so a ticket is emailed once.
-- confirm_event_payment (0022, service role only) stays the one way a paid seat becomes confirmed.
-- No member can read or write these columns beyond what event_rsvp's existing rules allow (members have no direct
-- UPDATE on event_rsvp; the functions write with the service role).

alter table public.event_rsvp add column if not exists payment_order_id text;
alter table public.event_rsvp add column if not exists ticket_code text;
alter table public.event_rsvp add column if not exists ticket_sent_at timestamptz;
alter table public.event_rsvp drop constraint if exists event_rsvp_payment_order_len;
alter table public.event_rsvp add constraint event_rsvp_payment_order_len check (payment_order_id is null or char_length(payment_order_id) <= 64);
alter table public.event_rsvp drop constraint if exists event_rsvp_ticket_code_shape;
alter table public.event_rsvp add constraint event_rsvp_ticket_code_shape check (ticket_code is null or ticket_code ~ '^BRV-[A-Z2-9]{6}$');
create unique index if not exists event_rsvp_payment_order_idx on public.event_rsvp (payment_order_id) where payment_order_id is not null;
create unique index if not exists event_rsvp_ticket_code_idx on public.event_rsvp (ticket_code) where ticket_code is not null;
