-- 0082 (D-266): the daily nudge pushes. The harness has no pg_cron, pg_net or Vault, so this checks the guards:
-- N1 nothing is scheduled without pg_cron/pg_net (0, no error); N2 an unknown slot is refused; N3 members cannot call
-- the private functions; N4 unscheduling without pg_cron is a no-op.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;

do $$
begin
  if brivia_private.brivia_schedule_nudges() <> 0 then raise exception 'N1 scheduled without pg_cron'; end if;
  if pg_temp.code_of($q$select brivia_private.brivia_send_nudge('midnight')$q$) <> '22023' then raise exception 'N2 bad slot accepted'; end if;
  if has_function_privilege('authenticated', 'brivia_private.brivia_send_nudge(text)', 'execute')
     or has_function_privilege('anon', 'brivia_private.brivia_schedule_nudges()', 'execute') then
    raise exception 'N3 members can call the nudge functions';
  end if;
  if brivia_private.brivia_unschedule_nudges() <> 0 then raise exception 'N4 unschedule'; end if;
end $$;
select 'zt-daily-nudges N1-N4 OK';
