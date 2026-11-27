// RLS proof for the draft migration, against a real Postgres (PGlite, in-process).
// Skips if @electric-sql/pglite isn't installed: PGLITE_DIR=<dir with node_modules> node --test tests/connect-rls.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

let PGlite = null;
try { PGlite = (await import(createRequire((process.env.PGLITE_DIR || process.cwd()) + "/").resolve("@electric-sql/pglite"))).PGlite; } catch {}
const sql = readFileSync(new URL("../supabase/migrations/20261104120000_connect_submissions.sql", import.meta.url), "utf8");

test("anon can insert a plain row but cannot read, update, delete, or set server-only columns", { skip: !PGlite && "pglite not installed" }, async () => {
  const db = new PGlite();
  // the bits of a Supabase database the migration relies on
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    grant usage on schema public to anon, authenticated;`);
  await db.exec(sql);
  const asAnon = async (q) => { await db.exec("set role anon"); try { return await db.query(q); } finally { await db.exec("reset role"); } };
  const ok = `insert into public.connect_submissions (reference, kind, name, email, about) values ('KL-TEST-0001','artist','Demo','a@b.co','long enough about')`;
  await asAnon(ok);
  assert.equal((await db.query("select count(*)::int n from public.connect_submissions")).rows[0].n, 1);
  await assert.rejects(asAnon("select * from public.connect_submissions"), /permission denied/);
  await assert.rejects(asAnon("update public.connect_submissions set status='listed'"), /permission denied/);
  await assert.rejects(asAnon("delete from public.connect_submissions"), /permission denied/);
  await assert.rejects(asAnon(`insert into public.connect_submissions (reference, kind, name, email, about, status) values ('KL-TEST-0002','artist','D','a@b.co','long enough about','listed')`), /permission denied/);
  await assert.rejects(asAnon(`insert into public.connect_submissions (reference, kind, name, email, about, upload_path) values ('KL-TEST-0003','artist','D','a@b.co','long enough about','submissions/x')`), /permission denied/);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from public.connect_submissions"), /permission denied/);
  await db.exec("reset role");
  const b = (await db.query("select public, file_size_limit::int l, allowed_mime_types t from storage.buckets where id='connect-uploads'")).rows[0];
  assert.equal(b.public, false); assert.equal(b.l, 5242880); assert.ok(!b.t.includes("text/html"));
  await assert.rejects(db.query(`insert into public.connect_submissions (reference, kind, name, email, about) values ('KL-TEST-0004','spaceship','D','a@b.co','long enough about')`), /check/);
});
