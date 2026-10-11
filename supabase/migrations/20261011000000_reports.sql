-- "Report a problem": messages people send from the app, optionally with a diagnostic log they chose to attach.
-- Like the other tables: RLS on, no policies; reached only through the account and admin functions.
create table public.reports (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text not null default '',
  message text not null,
  log text,
  app_version text not null default '',
  platform text not null default '',
  created_at timestamptz not null default now()
);
create index reports_created_idx on public.reports (created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
