-- Build-service client contact (draft, NOT applied). Client sites made from build-service/starter
-- post their contact form to the client-contact edge function. Each client is one row in
-- client_sites: site id -> destination inbox + allowed origins. Messages are stored even when the
-- email fails. Both tables are service-role only: anon and authenticated get no grants at all.
create table if not exists public.client_sites (
  site_id         text primary key check (site_id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name            text not null check (char_length(name) between 1 and 120),
  to_email        text not null check (char_length(to_email) <= 254 and to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  allowed_origins text[] not null check (cardinality(allowed_origins) between 1 and 5),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.client_contact_messages (
  id            uuid primary key default gen_random_uuid(),
  site_id       text not null references public.client_sites(site_id) on delete cascade,
  reference     text not null unique,
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message       text not null check (char_length(message) between 10 and 2000),
  source        text check (char_length(source) <= 60),
  ip_hash       text,
  email_sent_at timestamptz,
  email_error   text,
  created_at    timestamptz not null default now()
);
create index if not exists client_contact_ip_recent on public.client_contact_messages (site_id, ip_hash, created_at desc);

alter table public.client_sites enable row level security;
alter table public.client_contact_messages enable row level security;
revoke all on public.client_sites, public.client_contact_messages from anon, authenticated;
-- No policies: only the edge function (service role) reads or writes.
