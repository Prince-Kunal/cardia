-- Cardia cloud sync, first schema (PLAN.md §5). Offline first: each computer's SQLite library is the
-- source of truth and the engine pushes its changes here and pulls others'. Everything lives in a
-- workspace (personal or lab) with roles owner / editor / viewer, enforced by row-level security.
--
--   workspaces, workspace_members        who may see and change what
--   hearts                               experiment details; per-field last writer wins (merge_heart)
--   heart_history                        every earlier version of a heart's details
--   heart_slices                         which heart each slice is in, its position and typed weight
--   slice_results                        analysis results: immutable once written
--   learn_progress, devices              per user
--   storage bucket "cardia"              <workspace>/results/<slice>/<layer>.png, <workspace>/images/<sha256>.<ext>
--
-- updated_at is set here, by the server, and is what engines pull by.

create extension if not exists pgcrypto;

create type public.workspace_kind as enum ('personal', 'lab');
create type public.workspace_role as enum ('owner', 'editor', 'viewer');

-- workspaces ------------------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  kind public.workspace_kind not null default 'lab',
  -- Original scans are the largest files, so uploading them is a choice per workspace.
  upload_images boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  added_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_by_user on public.workspace_members (user_id);

-- The caller's role in a workspace. Security definer, so policies can call it without recursing into
-- workspace_members' own policies.
create function public.workspace_role (ws uuid) returns public.workspace_role
language sql stable security definer set search_path = public as $$
  select role from public.workspace_members where workspace_id = ws and user_id = auth.uid()
$$;

create function public.can_read (ws uuid) returns boolean
language sql stable set search_path = public as $$ select public.workspace_role(ws) is not null $$;

create function public.can_write (ws uuid) returns boolean
language sql stable set search_path = public as $$ select public.workspace_role(ws) in ('owner', 'editor') $$;

-- Make a workspace and its owner in one step.
create function public.create_workspace (ws_name text, ws_kind public.workspace_kind default 'lab')
returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare ws public.workspaces;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.workspaces (name, kind, created_by) values (ws_name, ws_kind, auth.uid()) returning * into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws.id, auth.uid(), 'owner');
  return ws;
end $$;

-- The caller's personal workspace, made on first sign-in.
create function public.ensure_personal_workspace () returns public.workspaces
language plpgsql security definer set search_path = public as $$
declare ws public.workspaces;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select w.* into ws from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where w.kind = 'personal' and w.created_by = auth.uid() and m.user_id = auth.uid() and m.role = 'owner'
    order by w.created_at limit 1;
  if not found then
    ws := public.create_workspace('Personal', 'personal');
  end if;
  return ws;
end $$;

-- Add someone to a lab workspace by email (owners only). They must have signed up already.
create function public.add_member (ws uuid, member_email text, member_role public.workspace_role default 'editor')
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if public.workspace_role(ws) is distinct from 'owner' then raise exception 'only an owner can add people'; end if;
  if (select kind from public.workspaces where id = ws) = 'personal' then raise exception 'a personal workspace has one member'; end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then raise exception 'no Cardia account uses that email yet'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, member_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
end $$;

-- the library ------------------------------------------------------------------------------------

create function public.touch () returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.hearts (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  heart_key text not null check (char_length(heart_key) between 1 and 64),
  -- label, group, ischemia_min, reperfusion_min, experiment_date, operator, heart_weight_mg, notes,
  -- tags, favourite, deleted_at (a tombstone: the heart is in the trash)
  details jsonb not null default '{}'::jsonb,
  -- field -> when it was last set, on the computer that set it (per-field last writer wins)
  field_times jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (workspace_id, heart_key)
);
create index hearts_by_change on public.hearts (workspace_id, updated_at);
create trigger hearts_touch before insert or update on public.hearts for each row execute function public.touch();

create table public.heart_history (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  heart_key text not null,
  details jsonb not null,
  changed_by uuid,
  replaced_at timestamptz not null default now()
);
create index heart_history_by_heart on public.heart_history (workspace_id, heart_key, replaced_at);

create function public.keep_heart_history () returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.details is distinct from new.details then
    insert into public.heart_history (workspace_id, heart_key, details, changed_by)
      values (old.workspace_id, old.heart_key, old.details, old.updated_by);
  end if;
  return new;
end $$;
create trigger hearts_history after update on public.hearts for each row execute function public.keep_heart_history();

-- Merge one heart's details: each field takes the newer of the stored and the incoming value, so a
-- computer that was offline cannot overwrite a field someone changed later. Runs as the caller, so
-- row-level security decides whether they may write.
create function public.merge_heart (ws uuid, key text, fields jsonb, times jsonb, created timestamptz)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  cur public.hearts;
  f text;
  merged jsonb;
  merged_times jsonb;
begin
  select * into cur from public.hearts where workspace_id = ws and heart_key = key for update;
  if not found then
    insert into public.hearts (workspace_id, heart_key, details, field_times, created_at)
      values (ws, key, fields, times, created);
    return;
  end if;
  merged := cur.details;
  merged_times := cur.field_times;
  for f in select jsonb_object_keys(fields) loop
    if coalesce((times ->> f)::timestamptz, '-infinity') > coalesce((merged_times ->> f)::timestamptz, '-infinity') then
      merged := jsonb_set(merged, array[f], fields -> f, true);
      merged_times := jsonb_set(merged_times, array[f], times -> f, true);
    end if;
  end loop;
  if merged is distinct from cur.details then
    update public.hearts set details = merged, field_times = merged_times, updated_by = auth.uid()
      where workspace_id = ws and heart_key = key;
  end if;
end $$;

create table public.heart_slices (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slice_id text not null check (slice_id ~ '^[0-9a-f]{24}$'),
  heart_key text,                         -- null: taken out of its heart
  position integer not null default 0,
  typed_weight_mg double precision check (typed_weight_mg is null or typed_weight_mg > 0),
  changed_at timestamptz not null,        -- when, on the computer that changed it (last writer wins)
  updated_at timestamptz not null default now(),
  primary key (workspace_id, slice_id)
);
create index heart_slices_by_change on public.heart_slices (workspace_id, updated_at);
create trigger heart_slices_touch before insert or update on public.heart_slices for each row execute function public.touch();

-- Results never change once written: re-analysing makes a new slice id (PLAN.md §5, conflicts).
create table public.slice_results (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slice_id text not null check (slice_id ~ '^[0-9a-f]{24}$'),
  result jsonb not null,
  image_sha256 text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  pipeline_version text not null,
  layers text[] not null default '{}',    -- the layer PNGs in storage
  updated_at timestamptz not null default now(),
  primary key (workspace_id, slice_id)
);
create index slice_results_by_change on public.slice_results (workspace_id, updated_at);
create trigger slice_results_touch before insert on public.slice_results for each row execute function public.touch();

create table public.learn_progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  progress jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger learn_progress_touch before insert or update on public.learn_progress for each row execute function public.touch();

create table public.devices (
  id uuid primary key,                    -- made by the engine on first sign-in
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  app_version text,
  last_seen_at timestamptz not null default now()
);

-- row-level security -----------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.hearts enable row level security;
alter table public.heart_history enable row level security;
alter table public.heart_slices enable row level security;
alter table public.slice_results enable row level security;
alter table public.learn_progress enable row level security;
alter table public.devices enable row level security;

create policy "members read" on public.workspaces for select using (public.can_read(id));
create policy "owners rename" on public.workspaces for update using (public.workspace_role(id) = 'owner');
create policy "owners delete" on public.workspaces for delete using (public.workspace_role(id) = 'owner');
-- New workspaces come from create_workspace(), which also makes the owner.

create policy "members see members" on public.workspace_members for select using (public.can_read(workspace_id));
create policy "owners change roles" on public.workspace_members for update using (public.workspace_role(workspace_id) = 'owner');
create policy "owners remove, anyone leaves" on public.workspace_members for delete
  using (public.workspace_role(workspace_id) = 'owner' or user_id = auth.uid());

create policy "members read" on public.hearts for select using (public.can_read(workspace_id));
create policy "editors add" on public.hearts for insert with check (public.can_write(workspace_id));
create policy "editors change" on public.hearts for update using (public.can_write(workspace_id));
-- No delete: a heart in the trash is a tombstone (details.deleted_at).

create policy "members read" on public.heart_history for select using (public.can_read(workspace_id));

create policy "members read" on public.heart_slices for select using (public.can_read(workspace_id));
create policy "editors add" on public.heart_slices for insert with check (public.can_write(workspace_id));
create policy "editors change" on public.heart_slices for update using (public.can_write(workspace_id));

create policy "members read" on public.slice_results for select using (public.can_read(workspace_id));
create policy "editors add" on public.slice_results for insert with check (public.can_write(workspace_id));
-- No update or delete: results are immutable.

create policy "own progress" on public.learn_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own devices" on public.devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- files ------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('cardia', 'cardia', false) on conflict (id) do nothing;

create policy "cardia members read" on storage.objects for select
  using (bucket_id = 'cardia' and public.can_read(((storage.foldername(name))[1])::uuid));
create policy "cardia editors upload" on storage.objects for insert
  with check (bucket_id = 'cardia' and public.can_write(((storage.foldername(name))[1])::uuid));
create policy "cardia editors replace" on storage.objects for update
  using (bucket_id = 'cardia' and public.can_write(((storage.foldername(name))[1])::uuid));
