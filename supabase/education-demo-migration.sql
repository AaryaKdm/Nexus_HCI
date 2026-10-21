-- Run in Supabase SQL Editor on an existing Nexus project before seeding demo members.
-- Additive catch-up only: no users, posts, messages, or connections are deleted.
begin;
alter table public.profiles add column if not exists university text not null default '';
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.jobs add column if not exists source text not null default 'Nexus';
alter table public.jobs add column if not exists source_job_id text;
alter table public.jobs add column if not exists apply_url text;
alter table public.jobs add column if not exists external_created_at timestamptz;
alter table public.jobs add column if not exists last_synced_at timestamptz;
create unique index if not exists jobs_source_external_id_key on public.jobs(source, source_job_id);
alter table public.notifications add column if not exists link text not null default '';
notify pgrst, 'reload schema';
commit;
