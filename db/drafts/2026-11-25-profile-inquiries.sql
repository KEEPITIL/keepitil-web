-- DRAFT — NOT APPLIED. Needs Joe/Grok to apply to keepitil-prod.
-- Stores contact messages sent from profile pages to the page owner. Service role only:
-- the edge function (db/drafts/profile-inquiry/index.ts) is the sole writer and reader.
create table if not exists public.profile_inquiries (
  id bigint generated always as identity primary key,
  profile_slug text not null,
  sender_name text not null check (char_length(sender_name) between 2 and 80),
  sender_email text not null check (char_length(sender_email) <= 254),
  message text not null check (char_length(message) between 10 and 2000),
  ip_hash text,
  emailed_at timestamptz,
  email_error text,
  created_at timestamptz not null default now()
);
create index if not exists profile_inquiries_ip_idx on public.profile_inquiries (ip_hash, created_at);
create index if not exists profile_inquiries_slug_idx on public.profile_inquiries (profile_slug, created_at);
alter table public.profile_inquiries enable row level security;
-- No policies on purpose: anon/authenticated cannot read or write; the service role bypasses RLS.
revoke all on public.profile_inquiries from anon, authenticated;
