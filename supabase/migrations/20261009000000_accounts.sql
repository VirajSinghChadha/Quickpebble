-- Quick Pebble accounts: beta access codes, profiles and encrypted API keys.
-- Row level security is on with no policies: the tables are only reachable through the
-- `account` and `admin` edge functions, which use the service role after checking who is calling.

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null default '',
  tier text not null default 'beta',
  max_uses integer not null default 1 check (max_uses >= 1),
  uses integer not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  code_id uuid references public.access_codes (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.user_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai', 'anthropic')),
  ciphertext text not null,
  iv text not null,
  last4 text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.access_codes enable row level security;
alter table public.profiles enable row level security;
alter table public.user_keys enable row level security;
revoke all on public.access_codes, public.profiles, public.user_keys from anon, authenticated;
