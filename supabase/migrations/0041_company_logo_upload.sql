set lock_timeout = '5s';
-- 0041_company_logo_upload.sql: a member can give the company they picked a logo (founder request 2026-11-04, D-149:
-- "an option in the same box ... where user can upload the logo"). Applied after 0040 (README "## 0041").
-- 0001-0040 are frozen. Idempotent.
--   set_company_logo(company, path): the logo the member just uploaded to company-logos/<their uid>/ becomes the
--   company's logo when it has none yet (one of the directory companies whose site gave no icon), or when the member
--   added that organisation themselves (they may replace their own). A logo that exists on a directory company is never
--   overwritten by a member. At most 10 logo uploads a day per member (company_logo_upload log).

create table if not exists public.company_logo_upload (
  company_id uuid not null references public.company(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  logo_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists company_logo_upload_member_idx on public.company_logo_upload (member_id, created_at);
alter table public.company_logo_upload enable row level security;
revoke all on public.company_logo_upload from public, anon, authenticated;

create or replace function public.set_company_logo(p_company uuid, p_path text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.company%rowtype;
  v_path text := btrim(coalesce(p_path, ''));
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' or split_part(v_path, '/', 1) <> uid::text then
    raise exception 'invalid logo' using errcode = '22023';
  end if;
  select * into c from public.company where id = p_company;
  if not found then raise exception 'unknown company' using errcode = '22023'; end if;
  if c.logo_path is not null and not (c.source = 'member' and c.created_by = uid) then
    raise exception 'logo already set' using errcode = '22023';
  end if;
  if (select count(*) from public.company_logo_upload where member_id = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'try again later' using errcode = 'PT429';
  end if;
  update public.company set logo_path = v_path where id = p_company;
  insert into public.company_logo_upload (company_id, member_id, logo_path) values (p_company, uid, v_path);
  return v_path;
end;
$$;
revoke all on function public.set_company_logo(uuid, text) from public, anon;
grant execute on function public.set_company_logo(uuid, text) to authenticated;
