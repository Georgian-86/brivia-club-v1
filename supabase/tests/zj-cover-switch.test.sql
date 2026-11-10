-- 0070 (D-227): the switch logic, run on a member with SMASH THEORY: switched once, the old cover kept, members cannot
-- read the backup, and a later SMASH THEORY is not switched again by a re-run.
do $$
declare mid uuid := '0e700000-0000-4000-8000-000000000001';
begin
  insert into auth.users(id) values (mid) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email, cover_url)
  values (mid, 'Cover Switch', 'Cover Switch', 'cover-switch@example.com', '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG')
  on conflict (id) do update set cover_url = excluded.cover_url;
  delete from brivia_private.cover_switch_d227;
end $$;
\ir ../migrations/0070_default_cover_at_work.sql
do $$
declare mid uuid := '0e700000-0000-4000-8000-000000000001';
begin
  if (select cover_url from public.profiles where id = mid) <> '/Images/Cover%20images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG' then
    raise exception 'FAIL C1: SMASH THEORY was not switched to AT WORK'; end if;
  if (select old_cover_url from brivia_private.cover_switch_d227 where member_id = mid) is distinct from '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG' then
    raise exception 'FAIL C1: the old cover was not kept'; end if;
  if has_table_privilege('authenticated', 'brivia_private.cover_switch_d227', 'select') then raise exception 'FAIL C1: members can read the backup'; end if;
  update public.profiles set cover_url = '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG' where id = mid;   -- chosen again later
end $$;
\ir ../migrations/0070_default_cover_at_work.sql
do $$
begin
  if (select cover_url from public.profiles where id = '0e700000-0000-4000-8000-000000000001') <> '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG' then
    raise exception 'FAIL C2: a re-run switched a later choice again'; end if;
  delete from public.profiles where id = '0e700000-0000-4000-8000-000000000001';
  delete from auth.users where id = '0e700000-0000-4000-8000-000000000001';
  raise notice 'C1 C2 OK';
end $$;
