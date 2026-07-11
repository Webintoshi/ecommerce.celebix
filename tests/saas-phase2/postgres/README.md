# Phase 2A1 Disposable PostgreSQL Evidence Harness

This directory contains static tests and a container-only PostgreSQL rehearsal for the Phase 2A1 migration bundle. It never accepts a database URL or ambient PostgreSQL/Supabase credential. The harness creates a unique Docker or Podman network and PostgreSQL container, publishes no host port, uses synthetic records only, and removes its container, network, databases, backup, and temporary evidence file.

PostgreSQL `16-alpine` is the disposable compatibility floor for this proof. The production PostgreSQL distribution, exact version, extensions/bootstrap behavior, provider, region, and migration executor remain an open infrastructure gate.

Run static checks:

```bash
node --test tests/saas-phase2/postgres/*.test.mjs
```

Run the complete disposable rehearsal:

```bash
node tests/saas-phase2/postgres/disposable-harness.mjs
```

The rehearsal applies the role bootstrap, forward migration, frozen seed, plan-version immutability seal, grants, and catalog assertions; exercises constraints, privilege denial, RLS, exact-host resolution, concurrency, backup/restore, rollback, and clean reapply; compares normalized schema dumps; then proves cleanup. It refuses ambient database credentials and any non-local Docker/Podman endpoint before pulling an image or creating resources. When neither Docker nor Podman is available it exits with code `77`, prints `DISPOSABLE_DB_EXECUTION_BLOCKED`, and makes no database connection. That result is PARTIAL evidence, not a database PASS.

No runtime `SaaSDataRepository`, persistent registration/session/OIDC adapter, production flag, deployment, or infrastructure integration is included.
