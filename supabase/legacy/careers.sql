-- Run this once in the Supabase SQL editor to enable Careers applications.
create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  name text not null,
  email text not null,
  linkedin_url text,
  resume_path text not null,
  resume_name text not null,
  resume_size integer not null,
  created_at timestamptz not null default now()
);

alter table public.career_applications enable row level security;

drop policy if exists "Anyone can submit career applications" on public.career_applications;
create policy "Anyone can submit career applications"
  on public.career_applications
  for insert
  to anon, authenticated
  with check (true);

insert into storage.buckets (id, name, public)
values ('career-resumes', 'career-resumes', false)
on conflict (id) do update set public = false;

drop policy if exists "Anyone can upload career resumes" on storage.objects;
create policy "Anyone can upload career resumes"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'career-resumes'
    and lower(storage.extension(name)) in ('pdf', 'doc', 'docx')
  );

notify pgrst, 'reload schema';
