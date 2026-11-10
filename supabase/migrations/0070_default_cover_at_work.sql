set lock_timeout = '5s';
-- 0070_default_cover_at_work.sql (D-227, founder 2026-11-10: "by default cover should be at work that is the first
-- one", then "do it": switch the members who have SMASH THEORY, the old default, to AT WORK). Apply after 0069
-- (README "## 0070"). 0001-0069 are frozen. Safe to re-run: it switches covers only once.
--
-- The database cannot tell a SMASH THEORY a member chose from the old default, so every member with it is switched,
-- and each one's previous cover is kept in brivia_private.cover_switch_d227 (members cannot read it) so the switch can
-- be undone. Once that table holds rows the switch never runs again: a member who picks SMASH THEORY later keeps it.
create table if not exists brivia_private.cover_switch_d227 (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  old_cover_url text not null,
  switched_at timestamptz not null default now()
);
revoke all on brivia_private.cover_switch_d227 from public, anon, authenticated;

do $$
begin
  if exists (select 1 from brivia_private.cover_switch_d227) then return; end if;   -- once only
  insert into brivia_private.cover_switch_d227 (member_id, old_cover_url)
  select id, cover_url from public.profiles where cover_url = '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG';
  update public.profiles p set cover_url = '/Images/Cover%20images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG'
    from brivia_private.cover_switch_d227 s
   where s.member_id = p.id and p.cover_url = '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG';
end $$;
-- Undo (only if wanted): update public.profiles p set cover_url = s.old_cover_url from brivia_private.cover_switch_d227 s
--   where s.member_id = p.id and p.cover_url = '/Images/Cover%20images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG';
