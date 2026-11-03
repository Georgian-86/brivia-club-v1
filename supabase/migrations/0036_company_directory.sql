set lock_timeout = '5s';
-- 0036_company_directory.sql: a company / organisation on every profile, from a directory that grows (founder request
-- 2026-11-03, D-140). Applied by hand in the Supabase SQL editor, as postgres, after 0035 (README "## 0036").
-- 0001-0035 are frozen. Idempotent: the local harness applies every migration twice.
--
-- What changes:
--   1. company: one row per organisation. Three sources: 'directory' (found on Wikidata by the directory Edge Function
--      and cached here with its logo, the first time anyone searches for it), 'member' (added by a member: a startup,
--      a small business, a club), 'admin' (added or confirmed by the team; verified = true). name_key is the folded
--      name; a website's domain is unique, so the same organisation is not added twice.
--   2. company-logos bucket (public read): directory logos under directory/, members' uploads under <their uid>/.
--      A company row stores the object path, never a free URL.
--   3. profiles.job_title (up to 60 characters) and profiles.company_id; set_my_work(title, company) sets both (or
--      clears them). member_work(ids): title, company name and logo path for members the caller may see (the same
--      rule as member_bio, 0016), for cards: "Software Engineer at Google".
--   4. search_companies(q): an exact name first, then verified, prefix matches, directory before member entries. add_company(...): a member's
--      own organisation (deduplicated by website domain, then by name; at most 5 new ones a day).
--      brivia_cache_companies(rows): the Edge Function's upsert (service role only).

-- 1. ------------------------------------------------------------------------------------------------------------------
create table if not exists public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  name_key text not null,
  domain text unique,
  website text,
  logo_path text check (logo_path is null or logo_path ~ '^(directory|[0-9a-f-]{36})/[A-Za-z0-9._-]{1,80}$'),
  industry text check (industry is null or char_length(industry) <= 40),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  wikidata_id text unique check (wikidata_id is null or wikidata_id ~ '^Q[0-9]{1,12}$'),
  source text not null default 'member' check (source in ('directory', 'member', 'admin')),
  verified boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_name_key_trgm on public.company using gin (name_key extensions.gin_trgm_ops);
create index if not exists company_name_key_idx on public.company (name_key);
create index if not exists company_created_by_idx on public.company (created_by, created_at);
alter table public.company enable row level security;
revoke all on public.company from public, anon, authenticated;
grant select (id, name, name_key, domain, website, logo_path, industry, country_code, source, verified) on public.company to authenticated;
drop policy if exists company_select on public.company;
create policy company_select on public.company for select to authenticated using (true);

create or replace function public.brivia_company_key()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.name_key := public.brivia_fold(new.name);
  return new;
end;
$$;
revoke all on function public.brivia_company_key() from public, anon, authenticated;
drop trigger if exists company_key on public.company;
create trigger company_key before insert or update of name on public.company
  for each row execute function public.brivia_company_key();

-- A website to its bare domain: "https://www.Swiggy.com/about" -> "swiggy.com". Null when it is not a domain.
create or replace function public.brivia_domain(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case when d ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and length(d) <= 120 then d end
    from (select regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '^[a-z]+://', ''), '^www\.', ''),
                                '[/?#:].*$', '') as d) x
$$;
revoke all on function public.brivia_domain(text) from public, anon, authenticated;

-- 2. ------------------------------------------------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('company-logos', 'company-logos', true) on conflict (id) do nothing;
    update storage.buckets set public = true where id = 'company-logos';
    -- Small raster images only (never SVG, which can carry script).
    if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
      execute $u$update storage.buckets set file_size_limit = 300000,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']
        where id = 'company-logos'$u$;
    end if;
  end if;
end $$;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "Members can upload company logos" on storage.objects';
    execute $p$create policy "Members can upload company logos" on storage.objects for insert to authenticated
      with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = (select auth.uid()::text))$p$;
    execute 'drop policy if exists "Members can view their own company logos" on storage.objects';
    execute $p$create policy "Members can view their own company logos" on storage.objects for select to authenticated
      using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = (select auth.uid()::text))$p$;
  end if;
end $$;

-- 3. ------------------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists company_id uuid references public.company(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_job_title_length') then
    alter table public.profiles add constraint profiles_job_title_length check (job_title is null or char_length(job_title) <= 60);
  end if;
end $$;
create index if not exists profiles_company_idx on public.profiles (company_id);

create or replace function public.set_my_work(p_title text, p_company uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if char_length(v_title) > 60 then raise exception 'title too long' using errcode = '22023'; end if;
  if p_company is not null and not exists (select 1 from public.company where id = p_company) then
    raise exception 'unknown company' using errcode = '22023';
  end if;
  update public.profiles set job_title = v_title, company_id = p_company where id = uid;
end;
$$;
revoke all on function public.set_my_work(text, uuid) from public, anon;
grant execute on function public.set_my_work(text, uuid) to authenticated;

create or replace function public.member_work(p_ids uuid[])
returns table(member_id uuid, job_title text, company_id uuid, company_name text, logo_path text, verified boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
  select p.id, p.job_title, c.id, c.name, c.logo_path, coalesce(c.verified, false)
    from public.profiles p
    left join public.company c on c.id = p.company_id
   where p.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:60])
     and (p.job_title is not null or p.company_id is not null)
     and (p.id = uid or public.brivia_visible_to(uid, p.id));
end;
$$;
revoke all on function public.member_work(uuid[]) from public, anon;
grant execute on function public.member_work(uuid[]) to authenticated;

-- 4. ------------------------------------------------------------------------------------------------------------------
create or replace function public.search_companies(p_q text, p_limit int default 8)
returns table(id uuid, name text, domain text, logo_path text, industry text, verified boolean, source text)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_q text := public.brivia_fold(left(coalesce(p_q, ''), 80));
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if length(v_q) < 1 then return; end if;
  return query
  select c.id, c.name, c.domain, c.logo_path, c.industry, c.verified, c.source
    from public.company c
   where c.name_key like v_q || '%' or c.name_key like '% ' || v_q || '%'
      or (length(v_q) >= 3 and c.name_key % v_q)
      or (c.domain is not null and c.domain like v_q || '%')
   order by (c.name_key = v_q) desc, c.verified desc, (c.name_key like v_q || '%') desc, (c.source <> 'member') desc,
            extensions.similarity(c.name_key, v_q) desc, c.name
   limit v_limit;
end;
$$;
revoke all on function public.search_companies(text, int) from public, anon;
grant execute on function public.search_companies(text, int) to authenticated;

create or replace function public.add_company(p_name text, p_website text default null, p_industry text default null,
                                              p_logo_path text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_domain text := public.brivia_domain(p_website);
  v_industry text := nullif(btrim(left(coalesce(p_industry, ''), 40)), '');
  v_logo text := nullif(btrim(coalesce(p_logo_path, '')), '');
  v_id uuid;
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 or v_name !~ '[[:alpha:]]' or v_name ~* '(https?://|www\.)' then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_logo is not null and split_part(v_logo, '/', 1) <> uid::text then
    raise exception 'invalid logo' using errcode = '22023';
  end if;
  -- The same organisation: its website, then its name.
  if v_domain is not null then select c.id into v_id from public.company c where c.domain = v_domain; end if;
  if v_id is null then
    select c.id into v_id from public.company c where c.name_key = public.brivia_fold(v_name)
     order by c.verified desc, (c.source = 'member'), c.created_at limit 1;
  end if;
  if v_id is not null then
    -- A member's own entry without a logo takes the logo they just uploaded.
    update public.company set logo_path = coalesce(logo_path, v_logo),
                              website = coalesce(website, case when v_domain is not null then 'https://' || v_domain end),
                              industry = coalesce(industry, v_industry)
     where id = v_id and created_by = uid and source = 'member';
    return v_id;
  end if;
  if (select count(*) from public.company where created_by = uid and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'try again later' using errcode = 'PT429';
  end if;
  insert into public.company (name, domain, website, logo_path, industry, source, created_by)
  values (v_name, v_domain, case when v_domain is not null then 'https://' || v_domain end, v_logo, v_industry, 'member', uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_company(text, text, text, text) from public, anon;
grant execute on function public.add_company(text, text, text, text) to authenticated;

-- The directory Edge Function's cache (service role only): [{wikidata_id, name, domain, logo_path, industry,
-- country_code}]. A known Wikidata id or domain is updated, never duplicated. Returns the rows' ids.
create or replace function public.brivia_cache_companies(p_rows jsonb)
returns setof uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare r jsonb; v_id uuid; v_domain text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    continue when coalesce(r->>'name', '') = '' or coalesce(r->>'wikidata_id', '') !~ '^Q[0-9]{1,12}$';
    v_domain := public.brivia_domain(r->>'domain');
    v_id := null;
    select c.id into v_id from public.company c where c.wikidata_id = r->>'wikidata_id';
    if v_id is null and v_domain is not null then select c.id into v_id from public.company c where c.domain = v_domain; end if;
    if v_id is null then
      insert into public.company (name, domain, website, logo_path, industry, country_code, wikidata_id, source)
      values (left(r->>'name', 80), v_domain, case when v_domain is not null then 'https://' || v_domain end,
              nullif(r->>'logo_path', ''), nullif(left(r->>'industry', 40), ''),
              case when r->>'country_code' ~ '^[A-Z]{2}$' then r->>'country_code' end, r->>'wikidata_id', 'directory')
      returning id into v_id;
    else
      update public.company set wikidata_id = coalesce(wikidata_id, r->>'wikidata_id'),
                                logo_path = coalesce(nullif(r->>'logo_path', ''), logo_path),
                                industry = coalesce(industry, nullif(left(r->>'industry', 40), ''))
       where id = v_id and source <> 'member';
    end if;
    return next v_id;
  end loop;
end;
$$;
revoke all on function public.brivia_cache_companies(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.brivia_cache_companies(jsonb) to service_role';
    execute 'grant select on public.company to service_role';
  end if;
end $$;
