-- Run once in the Supabase SQL Editor to enable profile-picture uploads.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "profile avatars are publicly readable" on storage.objects;
create policy "profile avatars are publicly readable" on storage.objects
for select using (bucket_id = 'avatars');

drop policy if exists "members upload their own profile avatar" on storage.objects;
create policy "members upload their own profile avatar" on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members update their own profile avatar" on storage.objects;
create policy "members update their own profile avatar" on storage.objects
for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members delete their own profile avatar" on storage.objects;
create policy "members delete their own profile avatar" on storage.objects
for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
