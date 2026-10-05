-- Minimal Supabase shape for local PostgreSQL verification (Ruling P1).
create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (id uuid primary key);
-- Minimal real-Supabase columns the seed script writes (Ruling I2); all nullable so other tests insert only id.
alter table auth.users
  add column if not exists instance_id uuid, add column if not exists aud text, add column if not exists role text,
  add column if not exists email text, add column if not exists encrypted_password text,
  add column if not exists email_confirmed_at timestamptz, add column if not exists raw_app_meta_data jsonb,
  add column if not exists raw_user_meta_data jsonb, add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text,
  -- Supabase anonymous sign-ins (D-038 hygiene: an anonymous account is never completed)
  add column if not exists is_anonymous boolean not null default false;
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, provider_id text not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
-- Supabase keeps pgcrypto (crypt, gen_salt) in the "extensions" schema.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;

create or replace function auth.uid() returns uuid language sql stable as $$
  -- Like Supabase's auth.uid(): an empty claims setting (left behind by an earlier SET LOCAL) means no user.
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
$$;

-- Supabase auth.jwt(): the whole claims object ({} when none).
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
-- Real Supabase has owner_id text; and forbids direct DELETEs on storage tables (the Storage API sets the flag).
alter table storage.objects add column if not exists owner_id text;
create or replace function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using hint = 'This prevents accidental data loss from orphaned objects.', errcode = '42501';
  end if;
  return null;
end $$;
drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
grant usage on schema storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create or replace function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;
-- Supabase grants the API roles table access on storage; RLS decides what they see.
grant all on storage.objects, storage.buckets to anon, authenticated;
