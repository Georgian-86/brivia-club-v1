-- Iteration 3 final review I-2: the nightly jobs. 0004 calls brivia_schedule_nightly_jobs(), which schedules
-- refresh_cell_density() and purge_expired_requests() when pg_cron is installed and does nothing otherwise. Re-running
-- it (0004 is applied twice in every deploy check) never adds a second copy of a job.
-- The local harness has no pg_cron, so a stub cron schema stands in for it, inside a transaction that is rolled back.
-- The stub's schedule() is a plain insert into a table with a unique jobname: a second schedule of the same name
-- fails, so the test proves the function unschedules by name first.

-- Without pg_cron: a no-op that returns 0 (the harness migrations already ran it that way).
do $$
begin
  if public.brivia_schedule_nightly_jobs() <> 0 then raise exception 'FAIL I-2: scheduled jobs without pg_cron'; end if;
end $$;

-- Owner only: no client role may call it.
do $$
declare r text; failed boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    failed := false;
    execute format('set local role %I', r);
    begin
      perform public.brivia_schedule_nightly_jobs();
    exception when insufficient_privilege then failed := true;
    end;
    reset role;
    if not failed then raise exception 'FAIL I-2: % may call brivia_schedule_nightly_jobs', r; end if;
  end loop;
end $$;

begin;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text not null unique, schedule text not null, command text not null);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
  language sql as $$ insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command) returning jobid $$;
create function cron.unschedule(p_name text) returns boolean
  language sql as $$ with d as (delete from cron.job where jobname = p_name returning 1) select exists (select 1 from d) $$;
-- An older copy of a job (for example from a first 0004 run) is replaced, not duplicated.
insert into cron.job (jobname, schedule, command) values ('brivia-purge-expired-requests', '0 0 * * *', 'select 1');

do $$
declare n int; got text;
begin
  if public.brivia_schedule_nightly_jobs() <> 2 then raise exception 'FAIL I-2: expected 2 jobs scheduled'; end if;
  if public.brivia_schedule_nightly_jobs() <> 2 then raise exception 'FAIL I-2: the second run did not reschedule 2 jobs'; end if;
  select count(*) into n from cron.job;
  if n <> 2 then raise exception 'FAIL I-2: % cron jobs after two runs, want 2', n; end if;
  select string_agg(jobname || ' | ' || schedule || ' | ' || command, ' ; ' order by jobname) into got from cron.job;
  if got is distinct from 'brivia-purge-expired-requests | 37 20 * * * | select public.purge_expired_requests() ; '
                          'brivia-refresh-cell-density | 17 20 * * * | select public.refresh_cell_density()' then
    raise exception 'FAIL I-2: unexpected cron jobs: %', got;
  end if;
end $$;
rollback;

select 'orbit-cron.test I-2 nightly jobs OK' as result;
