-- PENNIO Studio collaboration
-- Apply once in the Supabase SQL Editor, after 202611170001_pennio_studio_cloud.sql.
-- Until this is applied, Studio hides every collaboration control (it probes project_members).
--
-- Model
--   project_members   who a session is shared with, and in which role. Invited by email, active once they sign in.
--   project_sections  the shared state of a session, split in two sections: 'beat' (pattern, tempo, swing, key,
--                     chords) and 'mix' (levels and strip effects). Each row carries a revision number so two
--                     writers can never silently overwrite each other.
--   Roles             producer = beat + mix, beat = beat only, mixer = mix only, viewer = listens only.
--                     The owner always has both sections. The database enforces this; the Studio only mirrors it.

create table if not exists public.project_members (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  email text not null,
  member_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('producer','beat','mixer','viewer')),
  status text not null default 'invited' check (status in ('invited','active')),
  invited_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (owner_id, project_id, email)
);
create index if not exists project_members_member_idx on public.project_members (member_id);

create table if not exists public.project_sections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  section text not null check (section in ('beat','mix')),
  data jsonb not null,
  rev integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  primary key (owner_id, project_id, section)
);

alter table public.project_members enable row level security;
alter table public.project_sections enable row level security;

-- helpers (security definer so policies do not recurse into themselves)
create or replace function public.studio_role(o uuid, p text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = o then 'owner'
    else (select m.role from public.project_members m
          where m.owner_id = o and m.project_id = p and m.member_id = auth.uid() and m.status = 'active' limit 1)
  end
$$;

create or replace function public.studio_can_write(o uuid, p text, s text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.studio_role(o, p)
    when 'owner' then true
    when 'producer' then s in ('beat','mix')
    when 'beat' then s = 'beat'
    when 'mixer' then s = 'mix'
    else false
  end
$$;

-- project_members: the owner manages rows; an invited person can see their own invitation
drop policy if exists "Owner manages members" on public.project_members;
create policy "Owner manages members" on public.project_members
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Members see their own membership" on public.project_members;
create policy "Members see their own membership" on public.project_members
  for select to authenticated
  using (member_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists "Members see who else is on the session" on public.project_members;
create policy "Members see who else is on the session" on public.project_members
  for select to authenticated
  using (public.studio_role(owner_id, project_id) is not null);

-- accepting an invitation and showing presence go through functions, so nobody can edit their own role
create or replace function public.studio_accept_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.project_members
     set member_id = auth.uid(), status = 'active'
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
     and (member_id is null or member_id = auth.uid())
     and status <> 'active';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.studio_touch(o uuid, p text)
returns void language sql security definer set search_path = public as $$
  update public.project_members set seen_at = now()
   where owner_id = o and project_id = p and member_id = auth.uid() and status = 'active'
$$;

-- project_sections: members read; writes only for the sections the role covers
drop policy if exists "Members read sections" on public.project_sections;
create policy "Members read sections" on public.project_sections
  for select to authenticated
  using (public.studio_role(owner_id, project_id) is not null);

drop policy if exists "Members insert allowed sections" on public.project_sections;
create policy "Members insert allowed sections" on public.project_sections
  for insert to authenticated
  with check (public.studio_can_write(owner_id, project_id, section) and updated_by = auth.uid());

drop policy if exists "Members update allowed sections" on public.project_sections;
create policy "Members update allowed sections" on public.project_sections
  for update to authenticated
  using (public.studio_can_write(owner_id, project_id, section))
  with check (public.studio_can_write(owner_id, project_id, section) and updated_by = auth.uid());

-- people on a shared session can open the owner's saved session (name and last saved state), read-only
drop policy if exists "Members read shared projects" on public.projects;
create policy "Members read shared projects" on public.projects
  for select to authenticated
  using (public.studio_role(user_id, id) is not null);

-- near-live updates: the Studio polls every 2 s today; adding the table to the realtime publication lets a
-- websocket channel replace the polling later without another migration.
do $$ begin
  begin alter publication supabase_realtime add table public.project_sections; exception when others then null; end;
end $$;
