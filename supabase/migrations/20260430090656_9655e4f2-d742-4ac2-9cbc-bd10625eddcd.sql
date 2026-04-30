create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  user_agent text,
  platform text,
  ip_country text,
  ip_city text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_idx on public.user_sessions(user_id, last_active_at desc);

alter table public.user_sessions enable row level security;

create policy "users view own sessions"
  on public.user_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert own sessions"
  on public.user_sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users update own sessions"
  on public.user_sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own sessions"
  on public.user_sessions for delete
  to authenticated
  using (auth.uid() = user_id);