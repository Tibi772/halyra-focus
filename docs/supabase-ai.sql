-- Halyra AI (optional): daily message counter + plans for the halyra-ai Edge Function.
-- Run once in Supabase → SQL Editor, after docs/supabase.sql.

create table if not exists public.halyra_ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0,
  primary key (user_id, day)
);

-- plan = 'pro' while `until` is in the future (set by you / your payment webhook)
create table if not exists public.halyra_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'pro',
  until timestamptz not null
);

alter table public.halyra_ai_usage enable row level security;
alter table public.halyra_plans enable row level security;
-- users may read their own plan and usage (the app can show "12 / 30 today")
drop policy if exists "own usage" on public.halyra_ai_usage;
create policy "own usage" on public.halyra_ai_usage for select using (auth.uid() = user_id);
drop policy if exists "own plan" on public.halyra_plans;
create policy "own plan" on public.halyra_plans for select using (auth.uid() = user_id);

-- Counts one message; refuses when the allowance is used up.
-- Pro: free_limit is ignored, pro_limit per day. Free: free_limit per calendar month.
create or replace function public.halyra_ai_bump(uid uuid, free_limit integer, pro_limit integer)
returns json language plpgsql security definer set search_path = public as $$
declare
  is_pro boolean;
  lim integer;
  bucket date;
  n integer;
begin
  is_pro := exists (select 1 from halyra_plans p where p.user_id = uid and p.until > now());
  lim := case when is_pro then pro_limit else free_limit end;
  bucket := case when is_pro then (now() at time zone 'utc')::date else date_trunc('month', now() at time zone 'utc')::date end;
  insert into halyra_ai_usage (user_id, day, count) values (uid, bucket, 1)
  on conflict (user_id, day) do update set count = halyra_ai_usage.count + 1
  returning count into n;
  if n > lim then
    update halyra_ai_usage set count = count - 1 where user_id = uid and day = bucket;
    return json_build_object('ok', false, 'limit', lim, 'pro', is_pro);
  end if;
  return json_build_object('ok', true, 'used', n, 'limit', lim, 'pro', is_pro);
end $$;
revoke all on function public.halyra_ai_bump(uuid, integer, integer) from public, anon, authenticated;
