-- Halyra Focus: account + sync table. Run this once in Supabase → SQL Editor.
create table if not exists public.halyra_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  device text,
  updated_at timestamptz not null default now()
);
alter table public.halyra_sync enable row level security;
drop policy if exists "read own" on public.halyra_sync;
drop policy if exists "insert own" on public.halyra_sync;
drop policy if exists "update own" on public.halyra_sync;
drop policy if exists "delete own" on public.halyra_sync;
create policy "read own" on public.halyra_sync for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own" on public.halyra_sync for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own" on public.halyra_sync for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own" on public.halyra_sync for delete to authenticated using ((select auth.uid()) = user_id);
-- Signed-out visitors get nothing; signed-in users only the four row operations (RLS: own row only).
revoke all on public.halyra_sync from anon;
revoke all on public.halyra_sync from authenticated;
grant select, insert, update, delete on public.halyra_sync to authenticated;

-- "Delete my account": removes the signed-in user and, through the foreign keys, everything they stored.
create or replace function public.halyra_delete_account()
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'auth required'; end if;
  if to_regclass('public.halyra_lb_members') is not null then
    execute 'delete from public.halyra_lb_members where user_id = $1' using uid;
    execute 'delete from public.halyra_lb_groups g where not exists (select 1 from public.halyra_lb_members m where m.group_id = g.id)';
  end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.halyra_delete_account() from public, anon;
grant execute on function public.halyra_delete_account() to authenticated;
