-- 0053 (D-183): ticket and payment columns on event_rsvp.
-- T1 the columns exist; members still have no policy to read or write event_rsvp rows directly (RLS on, no policy).
-- T2 a ticket code must be BRV- and six of A-Z / 2-9; one hold per Razorpay order; one row per ticket code.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;
do $$
declare e uuid; a uuid := '0e470000-0000-4000-8000-000000000001'; b uuid := '0e470000-0000-4000-8000-000000000002'; code text;
begin
  -- T1
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'event_rsvp'
       and column_name in ('payment_order_id', 'ticket_code', 'ticket_sent_at')) <> 3 then raise exception 'FAIL T1: columns'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.event_rsvp'::regclass) then raise exception 'FAIL T1: RLS off'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_rsvp' and cmd in ('UPDATE', 'ALL', 'INSERT', 'DELETE')) then
    raise exception 'FAIL T1: a member write policy on event_rsvp'; end if;
  -- T2
  insert into auth.users(id) values (a), (b) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values (a, 'Tix A', 'Tix A', 'tixa@example.com'), (b, 'Tix B', 'Tix B', 'tixb@example.com') on conflict (id) do nothing;
  insert into public.club_event (slug, title, category, venue_name, venue_area, venue_cell, starts_at, ends_at, fee_inr)
  values ('zz-tix-1', 'Ticket Test', 'music', 'Hall', 'Indiranagar, Bengaluru', public.brivia_grid_cell(12.97, 77.64, 7), now() + interval '3 days', now() + interval '3 days 2 hours', 499)
  on conflict (slug) do nothing;
  select id into e from public.club_event where slug = 'zz-tix-1';
  insert into public.event_rsvp (event_id, member_id, status) values (e, a, 'pending_payment'), (e, b, 'pending_payment') on conflict do nothing;
  update public.event_rsvp set payment_order_id = 'order_TEST000001' where event_id = e and member_id = a;
  code := pg_temp.code_of(format('update public.event_rsvp set payment_order_id = %L where event_id = %L and member_id = %L', 'order_TEST000001', e, b));
  if code <> '23505' then raise exception 'FAIL T2: a second hold took the same order (%)', code; end if;
  code := pg_temp.code_of(format('update public.event_rsvp set ticket_code = %L where event_id = %L and member_id = %L', 'BRV-12345O', e, a));
  if code <> '23514' then raise exception 'FAIL T2: a malformed code was accepted (%)', code; end if;
  update public.event_rsvp set ticket_code = 'BRV-K7Q2MX', ticket_sent_at = now() where event_id = e and member_id = a;
  code := pg_temp.code_of(format('update public.event_rsvp set ticket_code = %L where event_id = %L and member_id = %L', 'BRV-K7Q2MX', e, b));
  if code <> '23505' then raise exception 'FAIL T2: a ticket code was reused (%)', code; end if;
end $$;
select 'zb-event-tickets.test.sql OK' as result;
