-- Run once in the Supabase SQL editor.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro','business')),
  payfast_token text,
  updated_at timestamptz not null default now()
);
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;

-- Users can read their own plan but never change it. Only the payfast-itn function (service role) writes it.
create policy "read own profile" on public.profiles for select using (auth.uid() = user_id);

-- Cloud sync is the paid feature: only Pro and Business accounts can write.
create policy "read own workspace" on public.workspaces for select using (auth.uid() = user_id);
create policy "paid users insert workspace" on public.workspaces for insert
  with check (auth.uid() = user_id and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.plan in ('pro','business')));
create policy "paid users update workspace" on public.workspaces for update
  using (auth.uid() = user_id and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.plan in ('pro','business')))
  with check (auth.uid() = user_id);

-- Every new sign-up gets a Free profile.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (user_id) values (new.id) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
