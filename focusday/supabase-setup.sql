-- FocusDay cloud sync schema (Supabase)
-- Supabase Dashboard > SQL Editor > New query > paste and run.
create table if not exists public.focusday_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.focusday_data enable row level security;

drop policy if exists "Users can read their own FocusDay data" on public.focusday_data;
create policy "Users can read their own FocusDay data"
on public.focusday_data for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own FocusDay data" on public.focusday_data;
create policy "Users can insert their own FocusDay data"
on public.focusday_data for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own FocusDay data" on public.focusday_data;
create policy "Users can update their own FocusDay data"
on public.focusday_data for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
