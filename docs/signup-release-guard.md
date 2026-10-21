# Signup release guard

Every shared owner, customer-panel and storefront build requires a successful
signup rehearsal for the exact covered source inputs. A package, SQL migration,
signup/session implementation or rehearsal change invalidates the proof and
stops the build. Unrelated changes do not require a running database at build time.

## Update the proof after a relevant change

Use Node.js 24+ and PostgreSQL 16 binaries. Set `CELEBIX_TEST_PG_BIN` when PostgreSQL
is not available through `pg_config` or the standard local installation.

```sh
npm run refresh:signup-release
npm run check:signup-release
```

The refresh command starts disposable socket-only databases, applies the frozen
historical baseline and all current forward migrations, and executes real
WhatsApp proof → tenant/profile/subscription → panel session flows. It also checks
idempotent retries, rejected proofs and historical tariff snapshots. It writes
`scripts/signup-release-proof.json` only after both native suites succeed and the
source inputs remain unchanged. Commit the proof with the tested changes.

No live database URL, provider credential, WhatsApp delivery or customer account
is used. Temporary databases are stopped and removed after the test.

## Continuous and production build checks

The `Signup release guard` workflow runs on every push and pull request, with no
branch or path exception. It checks the committed proof and reruns both native
suites on PostgreSQL 16. It uses no repository secrets.

Workspace `prebuild` hooks and the shared owner/customer-panel Coolify
build-command prefix run the cheap source/proof comparison. A pinned old candidate
without the guard command, or a candidate with a stale proof, cannot use those
configured Nixpacks build commands. The updated storefront Dockerfile includes
the verification inputs in its build stage only. Historical Dockerfile candidates
predating this guard do not gain it retroactively; their explicit rollback or
publication still needs the normal reviewed publisher admission.

### Storefront recipe and platform build arguments

`Dockerfile.storefront` has an exact committed mirror at
`scripts/signup-build-inputs/Dockerfile.storefront`. Both must be regular files,
contain identical bytes, and remain covered by the proof. Edit both together and
refresh the native proof after a recipe change. Missing files, symlinks or a
mismatch stop both checking and proof writing.

Coolify adds build `ARG` declarations to its executed Dockerfile. The build stage
copies the reviewed mirror to `/app/Dockerfile.storefront` before running the
unchanged guard. This restores the original source input; it does not strip or
ignore lines in proof comparison, and every other covered input remains checked.

The publisher must run `npm run check:signup-release` on the exact committed
candidate **before** platform mutation and bind that candidate to the application
pin, `SOURCE_COMMIT` and official queue commit. The reviewed platform mutator must
be confirmed to add only build arguments after `FROM`; review that assumption
again if the platform implementation changes. The guard inside the image checks
the installed canonical source inputs. It does not independently authenticate
the raw recipe executed by the platform. Keep the outside-image candidate check
and reviewed platform transformation as required publication admission.

This protects against tested-source drift and the package/signup mismatch that
caused the incident. It is not a signature against a malicious maintainer, and
does not prove that a later live database change or external provider outage is
healthy. Database migrations still require reviewed live preconditions and
postconditions. Do not edit the proof by hand or remove the build guard to ship.

## Recovery

An existing running application is unaffected by a failed build. Keep its current
release running, correct the mismatch, rerun the rehearsal, and publish the
verified candidate. A runtime rollback must use the normal reviewed release path;
never disable authentication or replay an uncertain customer registration.
