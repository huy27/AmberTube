-- AmberTube: accounts + cross-device sync of personal music data.
-- Supabase stores ONLY user data. Music still comes from YouTube / Last.fm / etc.; no audio is stored.
-- Every row belongs to one user (user_id) and Row Level Security limits each user to their own rows.
--
-- Sync model (see src/sync/): the browser keeps a local copy and pushes changed rows with `changed_at`
-- (when the user made the change). The server stamps `updated_at` (used by other devices to pull changes)
-- and ignores a write older than what it already has, so an offline device can't undo a newer change.
-- Deletions are kept as `deleted = true` tombstones so they reach every device.

-- ---------- helpers ----------
create or replace function public.ambertube_sync_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- a client clock far in the future must not win every conflict
  new.changed_at := least(coalesce(new.changed_at, now()), now() + interval '5 minutes');
  if tg_op = 'UPDATE' then
    if new.changed_at < old.changed_at then
      return null; -- stale write (e.g. an offline device catching up): keep the newer row
    end if;
    new.user_id := old.user_id; -- rows never move between users
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 500 and avatar_url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ambertube_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80),
    case when new.raw_user_meta_data ->> 'avatar_url' ~ '^https://' then left(new.raw_user_meta_data ->> 'avatar_url', 500) end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Optional: create the profile automatically at sign-up. Some Supabase projects don't allow triggers on
-- auth.users from the SQL editor ("must be owner of table users"); then this is skipped and the app
-- creates the profile itself on first sign-in (see the "profiles: insert own" policy below).
do $$
begin
  execute 'drop trigger if exists ambertube_on_auth_user_created on auth.users';
  execute 'create trigger ambertube_on_auth_user_created after insert on auth.users for each row execute function public.ambertube_new_profile()';
exception when others then
  raise notice 'AmberTube: trigger on auth.users skipped (%); profiles are created by the app', sqlerrm;
end $$;

create or replace function public.ambertube_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.id := old.id;
  return new;
end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.ambertube_touch();

-- ---------- favorites ----------
-- provider + track_id identify the song at its provider (YouTube: the videoId); `track` is a small
-- metadata snapshot (title, channel, duration, thumbnail…) so lists render without refetching.
create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('youtube', 'demo', 'lastfm', 'radio-browser')),
  track_id text not null check (char_length(track_id) between 1 and 200),
  track jsonb not null default '{}' check (jsonb_typeof(track) = 'object' and pg_column_size(track) <= 8192),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, provider, track_id)
);

-- ---------- listening history (recently played + listening statistics) ----------
-- kind 'recent': a "Nghe gần đây" entry; kind 'listen': one listening session (seconds listened,
-- completion, how it ended), from which statistics and recommendations are computed.
create table if not exists public.listening_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  kind text not null check (kind in ('recent', 'listen')),
  provider text not null check (provider in ('youtube', 'demo', 'lastfm', 'radio-browser')),
  track_id text not null check (char_length(track_id) between 1 and 200),
  track jsonb not null default '{}' check (jsonb_typeof(track) = 'object' and pg_column_size(track) <= 8192),
  played_at timestamptz not null,
  listened_sec double precision check (listened_sec is null or listened_sec between 0 and 86400),
  duration_sec double precision check (duration_sec is null or duration_sec between 0 and 86400),
  completion double precision check (completion is null or completion between 0 and 1),
  reason text check (reason is null or reason in ('ended', 'skipped', 'switched', 'stopped', 'closed')),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- ---------- search history ----------
create table if not exists public.search_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query_norm text not null check (char_length(query_norm) between 1 and 200),
  query text not null check (char_length(query) between 1 and 200),
  searched_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, query_norm)
);

-- ---------- playlists + their tracks ----------
create table if not exists public.playlists (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.playlist_tracks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  playlist_id text not null,
  provider text not null check (provider in ('youtube', 'demo', 'lastfm', 'radio-browser')),
  track_id text not null check (char_length(track_id) between 1 and 200),
  track jsonb not null default '{}' check (jsonb_typeof(track) = 'object' and pg_column_size(track) <= 8192),
  sort_order double precision not null default 0,
  added_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Keys added separately (and only once). The foreign key uses the SAME user_id as the row, so a song can
-- only be added to one of your own playlists.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'playlist_tracks_pkey') then
    alter table public.playlist_tracks add constraint playlist_tracks_pkey primary key (user_id, playlist_id, provider, track_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'playlist_tracks_playlist_fkey') then
    alter table public.playlist_tracks add constraint playlist_tracks_playlist_fkey
      foreign key (user_id, playlist_id) references public.playlists (user_id, id) on delete cascade;
  end if;
end $$;

-- ---------- settings ----------
-- data = { "<setting>": { "v": <value>, "t": <ms when changed> } }; merged per setting, newest wins,
-- so changing the visualizer on the phone and autoplay in the car both survive.
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 65536),
  changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.ambertube_settings_merge() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.changed_at := least(coalesce(new.changed_at, now()), now() + interval '5 minutes');
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.data := (
      select coalesce(jsonb_object_agg(s.k,
        case
          when s.o is null then s.n
          when s.n is null then s.o
          when coalesce((s.n ->> 't')::numeric, 0) >= coalesce((s.o ->> 't')::numeric, 0) then s.n
          else s.o
        end), '{}'::jsonb)
      from (
        select coalesce(a.key, b.key) as k, a.value as o, b.value as n
        from jsonb_each(old.data) a full join jsonb_each(new.data) b on a.key = b.key
      ) s
    );
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- triggers + indexes ----------
do $$
declare t text;
begin
  foreach t in array array['favorites', 'listening_history', 'search_history', 'playlists', 'playlist_tracks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sync_guard', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.ambertube_sync_guard()', t || '_sync_guard', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_pull_idx', t);
  end loop;
end $$;
drop trigger if exists user_settings_merge on public.user_settings;
create trigger user_settings_merge before insert or update on public.user_settings
  for each row execute function public.ambertube_settings_merge();
create index if not exists playlist_tracks_playlist_idx on public.playlist_tracks (user_id, playlist_id);

-- ---------- Row Level Security: each user sees and changes only their own rows ----------
alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.listening_history enable row level security;
alter table public.search_history enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare t text;
begin
  foreach t in array array['favorites', 'listening_history', 'search_history', 'playlists', 'user_settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

drop policy if exists "own rows" on public.playlist_tracks;
create policy "own rows" on public.playlist_tracks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.playlists p where p.user_id = (select auth.uid()) and p.id = playlist_id)
  );

-- signed-out visitors get nothing
revoke all on public.profiles, public.favorites, public.listening_history, public.search_history,
  public.playlists, public.playlist_tracks, public.user_settings from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.favorites, public.listening_history, public.search_history,
  public.playlists, public.playlist_tracks, public.user_settings to authenticated;

-- old listening sessions: the app keeps 120 days; this lets it clear its own older rows
create or replace function public.ambertube_prune_my_history(keep_days int default 180) returns void
language sql security invoker set search_path = '' as $$
  delete from public.listening_history
  where user_id = (select auth.uid()) and played_at < now() - make_interval(days => greatest(keep_days, 30));
$$;
revoke all on function public.ambertube_prune_my_history(int) from public, anon;
grant execute on function public.ambertube_prune_my_history(int) to authenticated;

-- ---------- Realtime: other devices hear about changes right away ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['favorites', 'listening_history', 'search_history', 'playlists', 'playlist_tracks', 'user_settings'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
