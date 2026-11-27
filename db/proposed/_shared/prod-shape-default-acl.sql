-- prod-shape-default-acl.sql: mirrors prod's pg_default_acl (run as the cluster SUPERUSER pgadmin in the replica database, AFTER the replica objects exist so only objects created LATER, i.e. by the packs, are affected).
-- Live prod fact (~/work/notes-pack/prod-private-schema-facts.md): for role postgres AND role supabase_admin, schema public: NEW tables get arwdDxtm and NEW functions get EXECUTE for postgres, anon, authenticated, service_role (sequences rwU).
-- No default ACLs exist for schema private. HAZARD reproduced here: any NEW function created in public by postgres / supabase_admin is born executable by anon / authenticated / service_role.
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
