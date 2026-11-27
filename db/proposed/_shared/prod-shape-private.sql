-- prod-shape-private.sql: makes a replica PROD-SHAPED for schema private (run as the stand-in `postgres`, BEFORE the packs; ALL SYNTHETIC, tables empty).
-- Live prod fact (read-only catalog capture 2026-11-10, ~/work/notes-pack/prod-private-schema-facts.md): schema private ALREADY EXISTS, owner postgres, nspacl NULL,
-- four postgres-only tables (relacl {postgres=arwdDxtm/postgres}), no functions. The column lists below are INVENTED (only name / kind / owner / ACL matter to the packs' guard);
-- one table has an identity column (-> owned sequence) and a primary key (-> index) so the guard's "own indexes / sequences / row + array types are allowed" rule is exercised.
create schema private;
create table private.incident_auth_counts_20261106 (id bigint generated always as identity primary key, bucket text, n integer);
create table private.incident_session_ids_20261106 (session_id uuid primary key, noted_at timestamptz);
create table private.incident_refresh_ids_20261106 (refresh_id bigint, noted_at timestamptz);
create table private.qr_token_backup_20261106 (order_id bigint, qr_token text);
-- materialise the explicit owner-only ACL prod shows ({postgres=arwdDxtm/postgres}); the schema ACL stays NULL like prod
revoke all on table private.incident_auth_counts_20261106, private.incident_session_ids_20261106, private.incident_refresh_ids_20261106, private.qr_token_backup_20261106 from public;
