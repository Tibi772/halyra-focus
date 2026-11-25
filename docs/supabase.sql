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
create policy "read own" on public.halyra_sync for select using (auth.uid() = user_id);
create policy "insert own" on public.halyra_sync for insert with check (auth.uid() = user_id);
create policy "update own" on public.halyra_sync for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.halyra_sync for delete using (auth.uid() = user_id);
