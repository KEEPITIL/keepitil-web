-- Connect "Get Listed" intake (draft, NOT applied). keepitil.com/connect/get-listed/ posts to the
-- connect-submit edge function, which stores the row with the service role and emails a copy to
-- info@keepitil.com. The anon grant + policy make the table insert-only for the public key too:
-- anon can add a plain row and can never read, update or delete one.
create table if not exists public.connect_submissions (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  kind          text not null check (kind in ('artist','brand','community','venue')),
  name          text not null check (char_length(name) between 2 and 120),
  contact_name  text check (char_length(contact_name) <= 120),
  email         text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city          text check (char_length(city) <= 120),
  links         text[] not null default '{}' check (cardinality(links) <= 5),
  about         text not null check (char_length(about) between 10 and 2000),
  upload_path   text check (upload_path is null or upload_path like 'submissions/%'),
  source        text check (char_length(source) <= 60),
  status        text not null default 'new' check (status in ('new','reviewing','listed','declined','spam')),
  ip_hash       text,
  email_sent_at timestamptz,
  email_error   text,
  created_at    timestamptz not null default now()
);
create index if not exists connect_submissions_ip_recent on public.connect_submissions (ip_hash, created_at desc);

alter table public.connect_submissions enable row level security;
revoke all on public.connect_submissions from anon, authenticated;
grant insert (reference, kind, name, contact_name, email, city, links, about, source)
  on public.connect_submissions to anon;

drop policy if exists connect_submissions_anon_insert on public.connect_submissions;
create policy connect_submissions_anon_insert on public.connect_submissions
  for insert to anon
  with check (status = 'new' and upload_path is null and ip_hash is null and email_sent_at is null);
-- No select / update / delete policy for anon or authenticated: reads are service role only.

-- Uploads: private bucket, 5 MB, JPEG/PNG/WebP/PDF. No storage.objects policy is granted to anon
-- or authenticated; only the edge function (service role) writes, under submissions/<reference>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('connect-uploads', 'connect-uploads', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
