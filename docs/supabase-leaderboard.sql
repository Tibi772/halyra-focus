-- Halyra Focus: opt-in leaderboard (weekly focus minutes), with friend groups.
-- Run once in Supabase → SQL Editor, after supabase.sql. Safe to run again.
-- Only focus minutes are shared (no screen time, no app names), and only by
-- people who turn the leaderboard on. Tables are not readable directly: all
-- access goes through the functions below, which check who is asking.

create table if not exists public.halyra_lb (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  emoji text not null default '🦊' check (char_length(emoji) <= 8),
  is_public boolean not null default false,
  week_start date not null,
  week_minutes int not null default 0 check (week_minutes between 0 and 10080),
  total_minutes int not null default 0 check (total_minutes >= 0),
  level int not null default 1,
  streak int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists halyra_lb_week on public.halyra_lb (week_start, week_minutes desc);

create table if not exists public.halyra_lb_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  owner uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.halyra_lb_members (
  group_id uuid not null references public.halyra_lb_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists halyra_lb_members_user on public.halyra_lb_members (user_id);

alter table public.halyra_lb enable row level security;
alter table public.halyra_lb_groups enable row level security;
alter table public.halyra_lb_members enable row level security;
-- (no policies: nobody reads or writes these tables directly)

-- Report my numbers. Minutes can't grow faster than real time.
create or replace function public.halyra_lb_report(
  p_name text, p_emoji text, p_public boolean, p_week_start date,
  p_week_minutes int, p_total int, p_level int, p_streak int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev public.halyra_lb;
  cap int;
  nm text := left(regexp_replace(coalesce(trim(p_name), ''), '[<>&"]', '', 'g'), 24);
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_week_start is null or p_week_start > current_date + 1 or p_week_start < current_date - 8 then raise exception 'bad week'; end if;
  if nm = '' then nm := 'Focuser'; end if;
  select * into prev from public.halyra_lb where user_id = auth.uid();
  -- no more minutes than have passed since the week started (with time-zone slack)
  cap := ceil(extract(epoch from (now() - (p_week_start::timestamp - interval '14 hours'))) / 60)::int;
  if prev.user_id is not null and prev.week_start = p_week_start then
    cap := least(cap, prev.week_minutes + ceil(extract(epoch from (now() - prev.updated_at)) / 60)::int + 30);
  end if;
  insert into public.halyra_lb as l (user_id, name, emoji, is_public, week_start, week_minutes, total_minutes, level, streak, updated_at)
  values (auth.uid(), nm, left(coalesce(p_emoji, '🦊'), 8), coalesce(p_public, false), p_week_start,
          greatest(0, least(coalesce(p_week_minutes, 0), cap, 10080)), greatest(0, coalesce(p_total, 0)),
          greatest(1, least(coalesce(p_level, 1), 999)), greatest(0, least(coalesce(p_streak, 0), 3650)), now())
  on conflict (user_id) do update set
    name = excluded.name, emoji = excluded.emoji, is_public = excluded.is_public,
    week_start = excluded.week_start, week_minutes = excluded.week_minutes, total_minutes = excluded.total_minutes,
    level = excluded.level, streak = excluded.streak, updated_at = now();
end $$;

-- The board: 'global' (people who chose to be public) or one of my groups.
create or replace function public.halyra_lb_board(p_scope text, p_group uuid default null)
returns table (rank bigint, name text, emoji text, week_minutes int, level int, streak int, me boolean)
language sql security definer set search_path = public stable as $$
  with ws as (select (date_trunc('week', now() at time zone 'utc'))::date as d),
  pool as (
    select l.* from public.halyra_lb l, ws
    where l.week_start >= ws.d - 1
      and (
        (p_scope = 'global' and (l.is_public or l.user_id = auth.uid()))
        or (p_scope = 'group'
            and exists (select 1 from public.halyra_lb_members m where m.group_id = p_group and m.user_id = l.user_id)
            and exists (select 1 from public.halyra_lb_members m2 where m2.group_id = p_group and m2.user_id = auth.uid()))
      )
  ),
  ranked as (
    select rank() over (order by week_minutes desc) as rank, row_number() over (order by week_minutes desc, updated_at) as rn,
           name, emoji, week_minutes, level, streak, user_id = auth.uid() as me
    from pool
  )
  select rank, name, emoji, week_minutes, level, streak, me from ranked
  where auth.uid() is not null and (rn <= 100 or me)
  order by rn;
$$;

create or replace function public.halyra_lb_groups_mine()
returns table (id uuid, name text, code text, members bigint, owner boolean)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.code,
         (select count(*) from public.halyra_lb_members m2 where m2.group_id = g.id),
         g.owner = auth.uid()
  from public.halyra_lb_groups g
  join public.halyra_lb_members m on m.group_id = g.id
  where m.user_id = auth.uid()
  order by g.created_at;
$$;

create or replace function public.halyra_lb_create_group(p_name text)
returns table (id uuid, name text, code text)
language plpgsql security definer set search_path = public as $$
declare
  c text;
  g uuid;
  nm text := left(regexp_replace(coalesce(trim(p_name), ''), '[<>&"]', '', 'g'), 40);
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if nm = '' then raise exception 'name required'; end if;
  if (select count(*) from public.halyra_lb_groups where owner = auth.uid()) >= 10 then raise exception 'too many groups'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.halyra_lb_groups x where x.code = c);
  end loop;
  insert into public.halyra_lb_groups (name, code, owner) values (nm, c, auth.uid()) returning halyra_lb_groups.id into g;
  insert into public.halyra_lb_members (group_id, user_id) values (g, auth.uid());
  return query select g, nm, c;
end $$;

create or replace function public.halyra_lb_join(p_code text)
returns table (id uuid, name text, code text)
language plpgsql security definer set search_path = public as $$
declare
  g public.halyra_lb_groups;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select * into g from public.halyra_lb_groups x where x.code = upper(trim(coalesce(p_code, '')));
  if g.id is null then raise exception 'group not found'; end if;
  if (select count(*) from public.halyra_lb_members m where m.group_id = g.id) >= 200 then raise exception 'group full'; end if;
  insert into public.halyra_lb_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return query select g.id, g.name, g.code;
end $$;

create or replace function public.halyra_lb_leave(p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  delete from public.halyra_lb_members where group_id = p_group and user_id = auth.uid();
  delete from public.halyra_lb_groups g where g.id = p_group and not exists (select 1 from public.halyra_lb_members m where m.group_id = g.id);
end $$;

-- Leave the leaderboard completely (my row and my group memberships).
create or replace function public.halyra_lb_delete_me()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  delete from public.halyra_lb where user_id = auth.uid();
  delete from public.halyra_lb_members where user_id = auth.uid();
  delete from public.halyra_lb_groups g where not exists (select 1 from public.halyra_lb_members m where m.group_id = g.id);
end $$;

revoke all on public.halyra_lb, public.halyra_lb_groups, public.halyra_lb_members from anon, authenticated;
revoke all on function public.halyra_lb_report(text, text, boolean, date, int, int, int, int) from public, anon;
revoke all on function public.halyra_lb_board(text, uuid) from public, anon;
revoke all on function public.halyra_lb_groups_mine() from public, anon;
revoke all on function public.halyra_lb_create_group(text) from public, anon;
revoke all on function public.halyra_lb_join(text) from public, anon;
revoke all on function public.halyra_lb_leave(uuid) from public, anon;
revoke all on function public.halyra_lb_delete_me() from public, anon;
grant execute on function public.halyra_lb_report(text, text, boolean, date, int, int, int, int) to authenticated;
grant execute on function public.halyra_lb_board(text, uuid) to authenticated;
grant execute on function public.halyra_lb_groups_mine() to authenticated;
grant execute on function public.halyra_lb_create_group(text) to authenticated;
grant execute on function public.halyra_lb_join(text) to authenticated;
grant execute on function public.halyra_lb_leave(uuid) to authenticated;
grant execute on function public.halyra_lb_delete_me() to authenticated;
