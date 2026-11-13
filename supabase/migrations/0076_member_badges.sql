set lock_timeout = '5s';
-- 0076_member_badges.sql (D-246, founder 2026-11-13: "i want this profile to be given admin tag", about the club's own
-- account "THE BRIVIA CLUB"). Apply after 0075 (README "## 0076"), then deploy the client. 0001-0075 are frozen.
-- Idempotent.
--
-- A badge is a label shown beside a member's name everywhere the app shows it ("Admin"). It is public on purpose: any
-- signed-in member may read the list. Nobody can give themselves one: members have SELECT only, and a badge is granted
-- by the founder in the SQL editor (README "## 0076"). It gives no powers; it is a label.
create table if not exists public.member_badge (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  badge text not null check (badge in ('admin')),
  granted_at timestamptz not null default now()
);
alter table public.member_badge enable row level security;
revoke all on public.member_badge from public, anon, authenticated;
grant select on public.member_badge to authenticated;
drop policy if exists member_badge_read on public.member_badge;
create policy member_badge_read on public.member_badge for select to authenticated using (true);
