-- harness-autocomplete.sql: a HARNESS-ONLY fixture. It is never a migration and must never run on a real project.
-- run.sh loads it in the full-chain database after the migrations and before the *.test.sql loop (the loop does not
-- match this file). It is not loaded in the seed database.
--
-- Why: Iteration 3 (D-030) redefines "completed" as a name, plus 1-12 interests summing to 20 points, plus a cell.
-- The iteration 0-2 suites create members with only a name and a city and expect them to be completed. This trigger
-- keeps their meaning ("completed" = the legacy rule brivia_is_completed(name, city)) without rewriting them:
--   * when a profile row satisfies the legacy rule, it gets one fixture interest worth 20 points (only if it has no
--     interests yet, so set_member_interests is never overridden) and a member_orbit at the Pune centroid (only if
--     it has none);
--   * when a row stops satisfying the rule (an UPDATE from completed to not completed), the fixture interest and the
--     member_orbit row are deleted.
-- A suite that tests the real rule starts with: set brivia.harness_autocomplete = 'off';
-- It writes no location_change row, so the 3-per-24 h location cap is unaffected.

-- Fixture taxonomy branch (retired, so it never shows up in pickers or in the active-node counts).
insert into public.interest_node (id, parent_id, level, label, status) values
  ('zz', null, 1, 'Harness fixture', 'retired'),
  ('zz.harness', 'zz', 2, 'Harness fixture', 'retired'),
  ('zz.harness.any', 'zz.harness', 3, 'Harness fixture interest', 'retired')
on conflict (id) do nothing;

create or replace function public.brivia_harness_autocomplete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cell text;
begin
  if current_setting('brivia.harness_autocomplete', true) = 'off' then
    return null;
  end if;
  if public.brivia_is_completed(new.name, new.city) then
    -- R1: the 18+ declaration is part of completion (0005), so the fixture declares first. Dynamic SQL and a column
    -- check keep the fixture loadable before 0005 exists.
    if to_jsonb(new) ? 'adult_declared_at' and to_jsonb(new)->>'adult_declared_at' is null then
      execute 'update public.profiles set adult_declared_at = now() where id = $1 and adult_declared_at is null' using new.id;
    end if;
    if not exists (select 1 from public.member_interest where member_id = new.id) then
      insert into public.member_interest (member_id, interest_id, points, mode)
      values (new.id, 'zz.harness.any', 20, 'play');
    end if;
    v_cell := public.brivia_grid_cell(18.5204, 73.8567, 7);   -- the Pune centroid (public.place 'in-pune')
    insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (new.id, 'grid1', v_cell, public.brivia_grid_parent(v_cell, 6), public.brivia_grid_parent(v_cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
  elsif tg_op = 'UPDATE' and public.brivia_is_completed(old.name, old.city) then
    delete from public.member_interest where member_id = new.id and interest_id = 'zz.harness.any';
    delete from public.member_orbit where member_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.brivia_harness_autocomplete() from public, anon, authenticated;

drop trigger if exists zz_brivia_harness_autocomplete on public.profiles;
create trigger zz_brivia_harness_autocomplete
  after insert or update on public.profiles
  for each row execute function public.brivia_harness_autocomplete();

select 'harness-autocomplete fixture loaded' as result;
