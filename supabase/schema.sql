-- Nexus complete database schema.
-- Run in Supabase SQL Editor. It is safe to rerun during development.
begin;

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Nexus user',
  headline text not null default '',
  bio text not null default '',
  avatar_url text,
  project_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists project_url text;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), title text not null, company text not null,
  location text not null, mode text not null check (mode in ('Remote','Hybrid','On-site')),
  type text not null check (type in ('Internship','Full-time')), remote boolean not null default false,
  city text not null default '', level text not null default 'Entry level', duration text not null default '',
  pay text not null default '', status text not null default 'open' check (status in ('open','closing','closed')),
  initials text not null default '', gradient text not null default 'linear-gradient(135deg,#2D6CDF,#6FA8FF)',
  skills jsonb not null default '[]'::jsonb, description text not null default '',
  responsibilities jsonb not null default '[]'::jsonb, company_about text not null default '',
  created_at timestamptz not null default now()
);
alter table public.jobs add column if not exists source text not null default 'Nexus';
alter table public.jobs add column if not exists source_job_id text;
alter table public.jobs add column if not exists apply_url text;
alter table public.jobs add column if not exists external_created_at timestamptz;
alter table public.jobs add column if not exists last_synced_at timestamptz;
drop index if exists public.jobs_source_external_id_key;
create unique index jobs_source_external_id_key on public.jobs(source, source_job_id);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','reviewing','shortlisted','rejected','withdrawn')),
  cover_note text not null default '', created_at timestamptz not null default now(), unique(user_id, job_id)
);
create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, job_id)
);

create table if not exists public.directory_people (
  id uuid primary key default gen_random_uuid(), name text not null unique, role text not null,
  initials text not null, gradient text not null, created_at timestamptz not null default now()
);
create table if not exists public.network_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references public.directory_people(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), primary key (user_id, person_id)
);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(), author_id uuid references auth.users(id) on delete set null,
  author_name text not null, author_headline text not null default '', author_initials text not null,
  author_gradient text not null default 'linear-gradient(135deg,#2D6CDF,#6FA8FF)',
  body text not null check (char_length(trim(body)) > 0), job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.feed_posts add column if not exists seed_key text;
create unique index if not exists feed_posts_seed_key on public.feed_posts(seed_key);
create table if not exists public.post_likes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (post_id, user_id)
);
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0), created_at timestamptz not null default now()
);
create table if not exists public.trending_topics (
  id uuid primary key default gen_random_uuid(), label text not null unique, search_query text not null default '',
  post_count integer not null default 0 check (post_count >= 0), sort_order integer not null default 0
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.directory_people(id) on delete cascade,
  sender text not null check (sender in ('contact','user')), body text not null, sequence integer not null default 0
);
create unique index if not exists message_templates_contact_sequence_key on public.message_templates(contact_id, sequence);
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.directory_people(id) on delete cascade,
  sender text not null check (sender in ('contact','user')), body text not null check (char_length(trim(body)) > 0),
  read_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  message text not null, link text not null default '', read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notifications add column if not exists link text not null default '';
create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  name text not null, email text not null, topic text not null, message text not null,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1), 'Nexus user'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.directory_people enable row level security;
alter table public.network_requests enable row level security;
alter table public.feed_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.trending_topics enable row level security;
alter table public.message_templates enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.contact_submissions enable row level security;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone" on public.profiles for select using (true);
drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "published jobs are public" on public.jobs;
create policy "published jobs are public" on public.jobs for select using (status <> 'closed');
drop policy if exists "users read own applications" on public.applications;
create policy "users read own applications" on public.applications for select using (auth.uid() = user_id);
drop policy if exists "users create own applications" on public.applications;
create policy "users create own applications" on public.applications for insert with check (auth.uid() = user_id);
drop policy if exists "users update own applications" on public.applications;
create policy "users update own applications" on public.applications for update using (auth.uid() = user_id);
drop policy if exists "users manage own saved jobs" on public.saved_jobs;
create policy "users manage own saved jobs" on public.saved_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "directory people are public" on public.directory_people;
create policy "directory people are public" on public.directory_people for select using (true);
drop policy if exists "users manage own network requests" on public.network_requests;
create policy "users manage own network requests" on public.network_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "feed posts are public" on public.feed_posts;
create policy "feed posts are public" on public.feed_posts for select using (true);
drop policy if exists "users create own posts" on public.feed_posts;
create policy "users create own posts" on public.feed_posts for insert with check (auth.uid() = author_id);
drop policy if exists "users manage own likes" on public.post_likes;
create policy "users manage own likes" on public.post_likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "comments are public" on public.post_comments;
create policy "comments are public" on public.post_comments for select using (true);
drop policy if exists "users create own comments" on public.post_comments;
create policy "users create own comments" on public.post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "trending topics are public" on public.trending_topics;
create policy "trending topics are public" on public.trending_topics for select using (true);
drop policy if exists "message templates are public" on public.message_templates;
create policy "message templates are public" on public.message_templates for select using (true);
drop policy if exists "users manage own conversation messages" on public.conversation_messages;
create policy "users manage own conversation messages" on public.conversation_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users manage own notifications" on public.notifications;
create policy "users manage own notifications" on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "anyone can submit contact form" on public.contact_submissions;
create policy "anyone can submit contact form" on public.contact_submissions for insert with check (true);

-- Seed database-owned catalog content without deleting account-owned activity.

do $$
begin
if not exists (select 1 from public.jobs) then
insert into public.jobs (title,company,location,mode,type,remote,city,level,duration,pay,status,initials,gradient,skills,description,responsibilities,company_about) values
('Frontend Developer Intern','TechNova Solutions','Mumbai, India','Hybrid','Internship',false,'Mumbai','Entry level','6 months','₹15,000/month','open','TN','linear-gradient(135deg,#2D6CDF,#6FA8FF)','["HTML/CSS","JavaScript","Git"]'::jsonb,'Work with the product team to build and polish user-facing features.','["Build responsive UI components","Fix bugs and improve performance","Participate in sprint planning","Write basic unit tests"]'::jsonb,'TechNova Solutions builds workplace productivity tools used by companies across India.'),
('Data Analyst — Graduate Program','Brightwave Analytics','Pune, India','On-site','Full-time',false,'Pune','Entry level','Full-time','₹4.5–6 LPA','closing','BW','linear-gradient(135deg,#7FD6A8,#2FAE66)','["Excel","SQL","Statistics"]'::jsonb,'Turn raw data into clear dashboards and insights for business teams.','["Clean and analyze datasets","Build dashboards","Present findings","Support ad-hoc requests"]'::jsonb,'Brightwave Analytics helps retail brands use customer data.'),
('UI/UX Design Intern','Pixel & Co.','Remote','Remote','Internship',true,'Remote','Entry level','3 months','₹10,000/month','open','PX','linear-gradient(135deg,#B78FFF,#6F6FE0)','["Figma","Wireframing","User Research"]'::jsonb,'Help design wireframes and prototypes for real client products.','["Create wireframes in Figma","Run usability tests","Iterate from feedback","Document design decisions"]'::jsonb,'Pixel & Co. is a remote design studio working with early-stage startups.'),
('Junior Software Engineer','CloudLeaf Systems','Bengaluru, India','On-site','Full-time',false,'Bengaluru','Entry level','Full-time','₹6–8 LPA','open','CL','linear-gradient(135deg,#FFC26F,#FF8A6F)','["Java","SQL","APIs"]'::jsonb,'Build and maintain backend services for a growing SaaS product.','["Develop REST APIs","Optimize SQL queries","Review pull requests","Join on-call rotation"]'::jsonb,'CloudLeaf Systems builds cloud storage infrastructure for enterprises.'),
('Digital Marketing Intern','Loopwave Media','Mumbai, India','Hybrid','Internship',false,'Mumbai','Entry level','4 months','₹8,000/month','open','LW','linear-gradient(135deg,#FF8AC0,#FF6F91)','["SEO","Content","Analytics"]'::jsonb,'Support campaign planning across social media and search.','["Draft social content","Track campaign performance","Assist with keyword research","Report weekly metrics"]'::jsonb,'Loopwave Media runs digital campaigns for D2C brands across India.'),
('Backend Developer (Node.js)','Harborline Tech','Remote','Remote','Full-time',true,'Remote','Mid level','Full-time','₹9–12 LPA','open','HT','linear-gradient(135deg,#4FD0C6,#2D9CDB)','["Node.js","MongoDB","Docker"]'::jsonb,'Own backend services for a logistics tracking platform.','["Design Node.js microservices","Set up CI/CD","Monitor production systems","Mentor interns"]'::jsonb,'Harborline Tech powers real-time tracking for logistics companies.');
end if;
end;
$$;

insert into public.directory_people (name,role,initials,gradient) values
('Sara Mehta','Data Analyst','SM','linear-gradient(135deg,#FFC26F,#FF8A6F)'),
('Arjun Verma','Backend Developer','AV','linear-gradient(135deg,#6FA8FF,#2D6CDF)'),
('Nisha Kulkarni','HR at TechNova','NK','linear-gradient(135deg,#7FD6A8,#2FAE66)'),
('Devika Rao','Product Designer','DR','linear-gradient(135deg,#B78FFF,#6F6FE0)'),
('Karan Shah','QA Engineer','KS','linear-gradient(135deg,#4FD0C6,#2D9CDB)'),
('Meera Iyer','Marketing Associate','MI','linear-gradient(135deg,#FF8AC0,#FF6F91)')
on conflict (name) do update set role=excluded.role, initials=excluded.initials, gradient=excluded.gradient;

insert into public.feed_posts (seed_key,author_name,author_headline,author_initials,author_gradient,body,job_id,created_at) values
('wireframing-workshop','Riya Shah','UX Designer at Studio Loop','RS','linear-gradient(135deg,#FFC26F,#FF8A6F)','Just wrapped up a wireframing workshop with our team. Low-fidelity sketches saved us a week of rework!',null,now()-interval '2 hours'),
('technova-hiring','TechNova Careers','Company page','TN','linear-gradient(135deg,#7FD6A8,#2FAE66)','We are hiring Frontend Developer Interns for our Mumbai office. Work on real products with a mentor.',(select id from public.jobs where company='TechNova Solutions' limit 1),now()-interval '5 hours'),
('interview-success','Priya Joshi','Final year, Computer Engineering','PJ','linear-gradient(135deg,#B78FFF,#6F6FE0)','Cleared my first technical interview today! I am sharing my preparation notes with anyone who needs them.',null,now()-interval '1 day')
on conflict (seed_key) do update set author_name=excluded.author_name, author_headline=excluded.author_headline,
author_initials=excluded.author_initials, author_gradient=excluded.author_gradient, body=excluded.body, job_id=excluded.job_id;

insert into public.trending_topics (label,search_query,post_count,sort_order) values
('#UIUXDesign','design',4210,1),('#CampusPlacements','placements',2875,2),('#InternshipTips','intern',1340,3)
on conflict (label) do update set search_query=excluded.search_query, post_count=excluded.post_count, sort_order=excluded.sort_order;

insert into public.message_templates (contact_id,sender,body,sequence)
select id,'contact','Hi! Thanks for applying to the Frontend Intern role.',1 from public.directory_people where name='Nisha Kulkarni'
union all select id,'contact','Are you available for a quick call this Thursday?',2 from public.directory_people where name='Nisha Kulkarni'
union all select id,'contact','Loved your thoughts on my wireframing post!',1 from public.directory_people where name='Sara Mehta'
union all select id,'contact','Are you going for the campus placement drive next week?',1 from public.directory_people where name='Arjun Verma'
on conflict (contact_id, sequence) do update set sender=excluded.sender, body=excluded.body;

notify pgrst, 'reload schema';
commit;
