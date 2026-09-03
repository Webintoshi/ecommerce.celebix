# Commerce Analytics Umami Backup and Restore Runbook

## Scope and authority

This runbook covers the environment-local, self-hosted Umami PostgreSQL database used by Celebix storefront analytics. It does not cover the SaaS commerce database, and it never authorizes production mutation. Storefront, checkout, payment, and PostgreSQL commerce truth must remain available when Umami is unavailable.

## Runtime inventory gate

Before each staging rollout, record the Coolify resource UUID, exact container image tag and immutable digest, `/api/heartbeat` result, PostgreSQL volume mount, CPU/RAM limits, database connection limit, disk usage, and log retention. Reject a mutable or unresolved image reference. Confirm that admin hostnames are not registered as storefront analytics hosts and that each store has at most one active Umami website binding.

## Backup policy

- Schedule one encrypted logical backup every 24 hours.
- Send the encrypted archive to protected off-site storage on a different physical host.
- Retain 7 daily, 4 weekly, and 3 monthly restore points.
- Use a restricted backup principal with read authority only for the Umami database.
- Write archives into a mode `0700` staging directory and store each archive with mode `0600`.
- Record only backup ID, UTC timestamp, byte size, SHA-256 digest, image digest, and safe result code. Never print connection strings, credentials, row values, visitor identifiers, or event payloads.
- Verify every custom-format archive with `pg_restore --list` before upload and verify the encrypted off-site object checksum after upload.

## Isolated restore rehearsal

1. Select the newest verified staging backup and record its immutable checksum.
2. Create an isolated disposable PostgreSQL instance with the same major version and no route from applications.
3. Create an empty database from `template0`; do not point any application, worker, DNS name, or Coolify service at it.
4. Restore with `pg_restore --exit-on-error --single-transaction` using the matching extension set and restricted local credentials.
5. Verify the expected Umami schema tables exist. Record only aggregate table counts and safe booleans: website count, session count, event count, event-data count, and migration metadata presence.
6. Confirm the restored counts are non-negative, website identities are unique, and the restore completes without invalid constraints.
7. Destroy the disposable database, container, plaintext archive copy, temporary catalog, and temporary logs. Preserve only the safe evidence record and the encrypted off-site backup.

The rehearsal is PASS only when restore finishes transactionally and all schema/count checks pass. Archive readability alone is not a restore PASS.

## Recovery procedure

During a staging Umami incident, keep storefront tracking fail-open and Customer Panel commerce cards on PostgreSQL. Stop the analytics delivery worker before restoring Umami so the durable outbox remains the backlog authority. Restore the selected verified archive into a new isolated database, run the rehearsal checks, switch only the staging Umami service after health is green, then restart the worker. Verify `/api/heartbeat`, one known store website binding, bounded backlog drain, retry/dead-letter counters, and the Customer Panel degraded-to-complete transition. Do not replay dead-letter rows until their safe error classification is reviewed.

## Failure and rollback

If restore or health verification fails, keep the prior Umami database and service binding unchanged, keep the worker stopped or retrying with bounded backoff, and leave commerce traffic operational in degraded analytics mode. Never roll back the SaaS schema to repair an Umami outage. Rollback is service-binding restoration to the last verified Umami database; the PostgreSQL commerce database remains the canonical revenue and recovery source.

## Required evidence

The closeout record contains environment name, Coolify UUIDs, source/merge SHA, exact image digest, heartbeat status, backup timestamp/checksum/size, off-site verification, restore PostgreSQL major, safe aggregate-count checks, worker backlog before/after, cleanup result, and operator UTC timestamps. It contains no secrets, raw events, customer data, IP addresses, or recovery tokens.
