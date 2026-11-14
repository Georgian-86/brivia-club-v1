-- 0082 (D-265): the four daily nudge pushes, in the founder's words (supabase/functions/_shared/nudges.js).
-- India time: 12:00 "Bore horhe ho?", 15:00 "Brivia se Itni Jaldi Bore hogye?", 18:00 "Ek Kachori Do Chai",
-- 21:30 "Career ki Tension Horhi hai?". pg_cron posts { slot } to the push-nudge Edge Function with pg_net; the
-- function sends that slot's words to every device with Brivia notifications on (not to members in the app now).
--
-- Needs pg_cron and pg_net (Database > Extensions) and two Vault secrets (README "## 0082"):
--   push_nudge_url     https://<project-ref>.supabase.co/functions/v1/push-nudge
--   push_nudge_secret  the same value as the function's NUDGE_SECRET
-- Without the extensions nothing is scheduled (a notice says so); without the secrets each run does nothing.
-- Idempotent: re-running replaces the four jobs. Stop them all: select brivia_private.brivia_unschedule_nudges();

create schema if not exists brivia_private;

create or replace function brivia_private.brivia_send_nudge(p_slot text)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_slot not in ('noon', 'afternoon', 'chai', 'night') then
    raise exception 'unknown nudge slot' using errcode = '22023';
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_nudge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_nudge_secret';
  if v_url is null or v_secret is null then
    raise notice 'push_nudge_url / push_nudge_secret are not in Vault: nudge % not sent', p_slot;
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-nudge-secret', v_secret),
    body := jsonb_build_object('slot', p_slot),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function brivia_private.brivia_send_nudge(text) from public, anon, authenticated;

create or replace function brivia_private.brivia_unschedule_nudges()
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer := 0;
  j text;
begin
  if to_regclass('cron.job') is null then return 0; end if;
  for j in execute $q$select jobname from cron.job where jobname like 'brivia-nudge-%'$q$ loop
    execute 'select cron.unschedule($1)' using j;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function brivia_private.brivia_unschedule_nudges() from public, anon, authenticated;

create or replace function brivia_private.brivia_schedule_nudges()
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  j record;
  n integer := 0;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regclass('cron.job') is null
     or to_regnamespace('net') is null then
    raise notice 'pg_cron or pg_net is not installed: the daily nudges are not scheduled (see supabase/migrations/README.md "## 0082").';
    return 0;
  end if;
  perform brivia_private.brivia_unschedule_nudges();
  -- Times are UTC (pg_cron's clock): IST minus 5:30. Keep in step with _shared/nudges.js (a unit test checks it).
  for j in
    select * from (values
      ('brivia-nudge-noon', '30 6 * * *', 'noon'),
      ('brivia-nudge-afternoon', '30 9 * * *', 'afternoon'),
      ('brivia-nudge-chai', '30 12 * * *', 'chai'),
      ('brivia-nudge-night', '0 16 * * *', 'night')
    ) v(jobname, schedule, slot)
  loop
    execute 'select cron.schedule($1, $2, $3)'
      using j.jobname, j.schedule, format('select brivia_private.brivia_send_nudge(%L)', j.slot);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function brivia_private.brivia_schedule_nudges() from public, anon, authenticated;

select brivia_private.brivia_schedule_nudges();
