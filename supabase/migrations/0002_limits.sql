-- AmberTube: per-user storage limits (plan B — at most ~10 MB per user, ~1.7 MB for a typical user).
-- Run after 0001_init.sql. Safe to run again.
--
--   favorites          5,000 songs                      → refused beyond (the app says so)
--   playlists          200 playlists                    → refused beyond
--   playlist songs     1,000 per playlist, 5,000 total  → refused beyond
--   recently played    newest 500 kept                  → older ones roll off automatically
--   listening stats    newest 2,000 kept, max 180 days  → older ones roll off automatically
--   search history     newest 100 kept                  → older ones roll off automatically
--   deleted markers    removed for good after 90 days   (daily job, needs pg_cron)

-- ---------- hard limits (refused with a clear message) ----------
create or replace function public.ambertube_enforce_limits() returns trigger
language plpgsql set search_path = '' as $$
declare
  n int;
begin
  -- only rows that become live count (new rows, or deleted ones brought back)
  if new.deleted or (tg_op = 'UPDATE' and not old.deleted) then
    return new;
  end if;
  -- an upsert of a row that already exists (and is live) is an update, not a new item
  if tg_op = 'INSERT' then
    if tg_table_name = 'favorites' then
      if exists (select 1 from public.favorites x where x.user_id = new.user_id and x.provider = new.provider and x.track_id = new.track_id and not x.deleted) then
        return new;
      end if;
    elsif tg_table_name = 'playlists' then
      if exists (select 1 from public.playlists x where x.user_id = new.user_id and x.id = new.id and not x.deleted) then
        return new;
      end if;
    elsif exists (select 1 from public.playlist_tracks x where x.user_id = new.user_id and x.playlist_id = new.playlist_id and x.provider = new.provider and x.track_id = new.track_id and not x.deleted) then
      return new;
    end if;
  end if;
  -- one user's writes are counted one at a time (two devices adding at once can't both slip past)
  perform pg_advisory_xact_lock(hashtextextended('ambertube-limit:' || new.user_id::text, 0));
  if tg_table_name = 'favorites' then
    select count(*) into n from public.favorites where user_id = new.user_id and not deleted;
    if n >= 5000 then
      raise exception 'AMBERTUBE_LIMIT:favorites:5000' using errcode = 'P0001', hint = 'Đã đạt tối đa 5.000 bài yêu thích.';
    end if;
  elsif tg_table_name = 'playlists' then
    select count(*) into n from public.playlists where user_id = new.user_id and not deleted;
    if n >= 200 then
      raise exception 'AMBERTUBE_LIMIT:playlists:200' using errcode = 'P0001', hint = 'Đã đạt tối đa 200 playlist.';
    end if;
  elsif tg_table_name = 'playlist_tracks' then
    select count(*) into n from public.playlist_tracks where user_id = new.user_id and playlist_id = new.playlist_id and not deleted;
    if n >= 1000 then
      raise exception 'AMBERTUBE_LIMIT:playlist_tracks:1000' using errcode = 'P0001', hint = 'Playlist này đã có tối đa 1.000 bài.';
    end if;
    select count(*) into n from public.playlist_tracks where user_id = new.user_id and not deleted;
    if n >= 5000 then
      raise exception 'AMBERTUBE_LIMIT:playlist_total:5000' using errcode = 'P0001', hint = 'Các playlist đã có tổng cộng tối đa 5.000 bài.';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['favorites', 'playlists', 'playlist_tracks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_limits', t);
    execute format('create trigger %I before insert or update of deleted on public.%I for each row execute function public.ambertube_enforce_limits()', t || '_limits', t);
  end loop;
end $$;

-- ---------- rolling limits (oldest rows roll off, nothing is refused) ----------
create or replace function public.ambertube_roll_history() returns trigger
language plpgsql set search_path = '' as $$
declare
  cap int := case new.kind when 'recent' then 500 else 2000 end;
begin
  delete from public.listening_history h
  where h.user_id = new.user_id and h.kind = new.kind
    and h.id in (
      select x.id from public.listening_history x
      where x.user_id = new.user_id and x.kind = new.kind
      order by x.played_at desc, x.id desc
      offset cap
    );
  return null;
end $$;

drop trigger if exists listening_history_roll on public.listening_history;
create trigger listening_history_roll after insert on public.listening_history
  for each row execute function public.ambertube_roll_history();

create or replace function public.ambertube_roll_searches() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.search_history s
  where s.user_id = new.user_id
    and s.query_norm in (
      select x.query_norm from public.search_history x
      where x.user_id = new.user_id
      order by x.searched_at desc, x.query_norm desc
      offset 100
    );
  return null;
end $$;

drop trigger if exists search_history_roll on public.search_history;
create trigger search_history_roll after insert on public.search_history
  for each row execute function public.ambertube_roll_searches();

-- ---------- what a user is using (account page) ----------
create or replace function public.ambertube_my_usage() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'favorites', (select count(*) from public.favorites where user_id = (select auth.uid()) and not deleted),
    'playlists', (select count(*) from public.playlists where user_id = (select auth.uid()) and not deleted),
    'playlist_tracks', (select count(*) from public.playlist_tracks where user_id = (select auth.uid()) and not deleted),
    'recent', (select count(*) from public.listening_history where user_id = (select auth.uid()) and kind = 'recent' and not deleted),
    'listens', (select count(*) from public.listening_history where user_id = (select auth.uid()) and kind = 'listen' and not deleted),
    'searches', (select count(*) from public.search_history where user_id = (select auth.uid()) and not deleted),
    'bytes', coalesce((select sum(pg_column_size(f.*)) from public.favorites f where f.user_id = (select auth.uid())), 0)
      + coalesce((select sum(pg_column_size(h.*)) from public.listening_history h where h.user_id = (select auth.uid())), 0)
      + coalesce((select sum(pg_column_size(t.*)) from public.playlist_tracks t where t.user_id = (select auth.uid())), 0)
      + coalesce((select sum(pg_column_size(s.*)) from public.search_history s where s.user_id = (select auth.uid())), 0)
      + coalesce((select sum(pg_column_size(p.*)) from public.playlists p where p.user_id = (select auth.uid())), 0)
      + coalesce((select sum(pg_column_size(u.*)) from public.user_settings u where u.user_id = (select auth.uid())), 0)
  )
$$;
revoke all on function public.ambertube_my_usage() from public, anon;
grant execute on function public.ambertube_my_usage() to authenticated;

-- ---------- daily clean-up for everyone (server-side; never callable from the app) ----------
create or replace function public.ambertube_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.listening_history where played_at < now() - interval '180 days';
  -- deletion markers only need to live long enough for every device to hear about them
  delete from public.favorites where deleted and updated_at < now() - interval '90 days';
  delete from public.listening_history where deleted and updated_at < now() - interval '90 days';
  delete from public.search_history where deleted and updated_at < now() - interval '90 days';
  delete from public.playlist_tracks where deleted and updated_at < now() - interval '90 days';
  delete from public.playlists where deleted and updated_at < now() - interval '90 days';
  -- safety net for rows written before these limits existed
  delete from public.search_history s using (
    select user_id, query_norm, row_number() over (partition by user_id order by searched_at desc, query_norm desc) as rn from public.search_history
  ) x where s.user_id = x.user_id and s.query_norm = x.query_norm and x.rn > 100;
  delete from public.listening_history h using (
    select user_id, id, kind, row_number() over (partition by user_id, kind order by played_at desc, id desc) as rn from public.listening_history
  ) x where h.user_id = x.user_id and h.id = x.id
    and x.rn > case x.kind when 'recent' then 500 else 2000 end;
end $$;
revoke all on function public.ambertube_cleanup() from public, anon, authenticated;

-- run it every day at 03:17 UTC (needs the pg_cron extension: Database → Extensions → pg_cron)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ambertube-cleanup', '17 3 * * *', 'select public.ambertube_cleanup()');
  else
    raise notice 'AmberTube: pg_cron is not enabled — enable it (Database → Extensions) and run this file again to schedule the daily clean-up.';
  end if;
end $$;

-- bring existing data within the rolling limits now
select public.ambertube_cleanup();
