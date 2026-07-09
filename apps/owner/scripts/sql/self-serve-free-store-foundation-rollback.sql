-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET.
-- Rollback proposal for self-serve free starter store foundation tables.
-- Scope: only proposed self_serve_* tables from self-serve-free-store-foundation-proposal.sql.
-- Existing owner_* source-of-truth tables are intentionally untouched.

begin;

drop table if exists self_serve_provisioning_jobs;
drop table if exists self_serve_store_memberships;
drop table if exists self_serve_store_domains;
drop table if exists self_serve_store_packages;
drop table if exists self_serve_store_registrations;

commit;
