-- Run this once in Supabase SQL Editor for an existing project.
-- Phone is kept as the display value plus separate country-code/number fields.
-- Passwords are never written to public.profiles.
alter table public.profiles add column if not exists phone_country_code text;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists gender text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender is null or gender in ('Male', 'Female', 'Prefer not to say'));

notify pgrst, 'reload schema';
