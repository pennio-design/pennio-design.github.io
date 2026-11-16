-- PENNIO Studio cloud foundation
-- Apply in Supabase SQL Editor before enabling CLOUD_ON in studio/index.html.
-- All project rows, user data and recording objects are scoped to the authenticated owner.

create table if not exists public.projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null default 'Untitled project',
  state jsonb,
  audio_name text,
  audio_path text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.projects enable row level security;
alter table public.user_data enable row level security;

drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects"
  on public.projects for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
  on public.projects for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own user data" on public.user_data;
create policy "Users can read their own user data"
  on public.user_data for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own user data" on public.user_data;
create policy "Users can insert their own user data"
  on public.user_data for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own user data" on public.user_data;
create policy "Users can update their own user data"
  on public.user_data for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own user data" on public.user_data;
create policy "Users can delete their own user data"
  on public.user_data for delete to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('recordings', 'recordings', false, 52428800)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their own recordings" on storage.objects;
create policy "Users can read their own recordings"
  on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload their own recordings" on storage.objects;
create policy "Users can upload their own recordings"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own recordings" on storage.objects;
create policy "Users can update their own recordings"
  on storage.objects for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own recordings" on storage.objects;
create policy "Users can delete their own recordings"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
