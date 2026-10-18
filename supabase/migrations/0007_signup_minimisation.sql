-- 0007: guided signup (Phase E, D-067). The privacy notice changes (new members give no phone number and no gender),
-- so its version moves to 2026-10-20. A client still on the old notice (2026-10-05, an open tab during the deploy)
-- keeps working for 14 days after the release date; after that only the current version is accepted.
-- Idempotent (create or replace only). Does not touch 0001-0006 or 0008. Apply in the SQL editor as postgres BEFORE the
-- client deploy (supabase/migrations/README.md): the old client keeps working through the grace window, but the new
-- client's 2026-10-20 declaration is refused by a database without 0007.

create or replace function public.brivia_notice_version()
returns text
language sql
immutable
set search_path = public
as $$ select '2026-10-20'::text $$;
revoke all on function public.brivia_notice_version() from public, anon;
grant execute on function public.brivia_notice_version() to authenticated;

-- True for the current version, and for the previous one until 14 days after the current release date.
create or replace function public.brivia_notice_accepted(p_version text, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = public
as $$
  select p_version is not null and (
    p_version = public.brivia_notice_version()
    or (p_version = '2026-10-05' and p_at < ('2026-10-20'::date + 14)::timestamptz)
  )
$$;
revoke all on function public.brivia_notice_accepted(text, timestamptz) from public, anon, authenticated;

-- The final 0005 body (with the rejoin tombstone check); only the version check changes (stale = not accepted, 22023).
create or replace function public.declare_adult(p_notice_version text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_first boolean;
begin
  perform 1 from public.profiles where id = uid for update;
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if not public.brivia_notice_accepted(p_notice_version) then
    raise exception 'stale notice version' using errcode = '22023';
  end if;
  select adult_declared_at is null into v_first from public.profiles where id = uid;
  if v_first then
    perform set_config('brivia.consent_write', 'on', true);
    update public.profiles set adult_declared_at = coalesce(adult_declared_at, now()) where id = uid;
    perform set_config('brivia.consent_write', 'off', true);
    insert into public.consent_event (member_id, kind, notice_version) values (uid, 'adult', p_notice_version);
    if exists (select 1 from public.moderation_tombstone t
                where t.expires_at > now()
                  and t.digest = public.brivia_email_digest((select u.email from auth.users u where u.id = uid))) then
      insert into public.member_flag (member_id, reason) values (uid, 'rejoin_review') on conflict (member_id) do nothing;
    end if;
  end if;
end;
$$;
revoke all on function public.declare_adult(text) from public, anon;
grant execute on function public.declare_adult(text) to authenticated;
