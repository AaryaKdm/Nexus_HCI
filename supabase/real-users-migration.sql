-- Run once in Supabase SQL Editor before deploying the new app code.
-- Existing account profiles, posts, comments, applications and jobs are preserved.
begin;

alter table public.profiles add column if not exists location text not null default '';
alter table public.profiles add column if not exists school text not null default '';
alter table public.profiles add column if not exists college text not null default '';
alter table public.profiles add column if not exists job_history text not null default '';
alter table public.profiles add column if not exists skills text not null default '';
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists github_url text;
alter table public.profiles add column if not exists instagram_url text;

create table if not exists public.user_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index if not exists user_connections_pair_key
  on public.user_connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_sender_created on public.direct_messages(sender_id, created_at);
create index if not exists direct_messages_recipient_created on public.direct_messages(recipient_id, created_at);

alter table public.user_connections enable row level security;
alter table public.direct_messages enable row level security;
drop policy if exists "members read own connections" on public.user_connections;
create policy "members read own connections" on public.user_connections for select using (auth.uid() in (requester_id, addressee_id));
drop policy if exists "members read own messages" on public.direct_messages;
create policy "members read own messages" on public.direct_messages for select using (auth.uid() in (sender_id, recipient_id));
drop policy if exists "members send own messages" on public.direct_messages;
create policy "members send own messages" on public.direct_messages for insert with check (auth.uid() = sender_id);
drop policy if exists "members mark received messages read" on public.direct_messages;

-- Keep historical interaction with demo contacts privately archived, then remove them.
create table if not exists public.legacy_demo_activity (
  kind text not null,
  source_key text not null,
  user_id uuid references auth.users(id) on delete cascade,
  payload jsonb not null,
  primary key (kind, source_key)
);
alter table public.legacy_demo_activity enable row level security;
drop policy if exists "members read archived demo activity" on public.legacy_demo_activity;
create policy "members read archived demo activity" on public.legacy_demo_activity for select using (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.network_requests') is not null then
    insert into public.legacy_demo_activity(kind, source_key, user_id, payload)
    select 'network_request', r.user_id::text || ':' || r.person_id::text, r.user_id,
      to_jsonb(r) || jsonb_build_object('contact_name', p.name)
    from public.network_requests r join public.directory_people p on p.id = r.person_id
    on conflict do nothing;
  end if;
  if to_regclass('public.conversation_messages') is not null then
    insert into public.legacy_demo_activity(kind, source_key, user_id, payload)
    select 'conversation_message', m.id::text, m.user_id,
      to_jsonb(m) || jsonb_build_object('contact_name', p.name)
    from public.conversation_messages m join public.directory_people p on p.id = m.contact_id
    on conflict do nothing;
  end if;
  if to_regclass('public.feed_posts') is not null then
    insert into public.legacy_demo_activity(kind, source_key, user_id, payload)
    select 'seed_post_comment', c.id::text, c.user_id, to_jsonb(c)
    from public.post_comments c join public.feed_posts p on p.id = c.post_id
    where p.seed_key is not null on conflict do nothing;
    insert into public.legacy_demo_activity(kind, source_key, user_id, payload)
    select 'seed_post_like', l.post_id::text || ':' || l.user_id::text, l.user_id, to_jsonb(l)
    from public.post_likes l join public.feed_posts p on p.id = l.post_id
    where p.seed_key is not null on conflict do nothing;
    insert into public.legacy_demo_activity(kind, source_key, user_id, payload)
    select 'seed_post', p.id::text, null, to_jsonb(p)
    from public.feed_posts p where p.seed_key is not null on conflict do nothing;
  end if;
end;
$$;

delete from public.feed_posts where seed_key is not null;

drop table if exists public.conversation_messages;
drop table if exists public.message_templates;
drop table if exists public.network_requests;
drop table if exists public.directory_people;

notify pgrst, 'reload schema';
commit;
