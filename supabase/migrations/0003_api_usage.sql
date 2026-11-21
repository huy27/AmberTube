-- AmberTube: shared counter of YouTube Data API calls, so the app can show how much of the daily quota is used
-- across ALL devices and users (they share one API key). Run after 0002_limits.sql. Safe to run again.
--
-- The table is closed to the API (RLS on, no policies, no grants). The app can only call two functions:
--   ambertube_record_api_usage(search, videos, channels)  add calls (each number capped at 500 per call)
--   ambertube_api_usage(days)                              read the last N days (default 7, max 30)
-- Anyone holding the anon key can call them, so the figures are an estimate (they could be inflated on purpose);
-- the real numbers are in Google Cloud Console. Days use America/Los_Angeles, when the YouTube quota resets.

create table if not exists public.api_usage (
  day date not null,
  search bigint not null default 0,
  videos bigint not null default 0,
  channels bigint not null default 0,
  primary key (day)
);
alter table public.api_usage enable row level security;
revoke all on table public.api_usage from public, anon, authenticated;

create or replace function public.ambertube_record_api_usage(p_search int, p_videos int, p_channels int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  s int := least(greatest(coalesce(p_search, 0), 0), 500);
  v int := least(greatest(coalesce(p_videos, 0), 0), 500);
  c int := least(greatest(coalesce(p_channels, 0), 0), 500);
begin
  if s + v + c = 0 then return; end if;
  insert into public.api_usage as u (day, search, videos, channels) values (d, s, v, c)
  on conflict (day) do update set search = u.search + excluded.search, videos = u.videos + excluded.videos, channels = u.channels + excluded.channels;
  delete from public.api_usage where day < d - 60;
end $$;
revoke all on function public.ambertube_record_api_usage(int, int, int) from public;
grant execute on function public.ambertube_record_api_usage(int, int, int) to anon, authenticated;

create or replace function public.ambertube_api_usage(p_days int default 7) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'search', search, 'videos', videos, 'channels', channels, 'units', search * 100 + videos + channels) order by day desc), '[]'::jsonb)
  from public.api_usage
  where day > (now() at time zone 'America/Los_Angeles')::date - least(greatest(coalesce(p_days, 7), 1), 30)
$$;
revoke all on function public.ambertube_api_usage(int) from public;
grant execute on function public.ambertube_api_usage(int) to anon, authenticated;
