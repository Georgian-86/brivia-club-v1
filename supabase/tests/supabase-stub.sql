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
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
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

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
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
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

create or replace function storage.extension(name text) returns text language sql immutable as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;
-- Supabase grants the API roles table access on storage; RLS decides what they see.
grant all on storage.objects, storage.buckets to anon, authenticated;
