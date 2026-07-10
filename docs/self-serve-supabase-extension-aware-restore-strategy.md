# Self-Serve Supabase Extension-Aware Restore Strategy

Status: **DESIGN ONLY - NOT APPROVED FOR RESTORE EXECUTION**

This document defines a deterministic, reviewable, fail-closed strategy for a future isolated Owner database restore rehearsal. It does not authorize backup access, catalog extraction, restore execution, SQL apply, deployment, environment changes, or infrastructure mutation.

## 1. Problem Statement

The latest isolated Owner database rehearsal proved that the retained custom archive is readable, but it did not produce a complete restored database. A source-compatible Supabase image supplies bootstrap and extension-managed objects that also appear as independent archive entries. One narrowly diagnosed duplicate was followed by another independent duplicate, so speculative filtering was stopped correctly.

A safe retry needs a complete, version-pinned inventory and an exact archive-item policy before execution. It must never infer ownership from schema names alone and must stop on every unknown collision.

## 2. Confirmed Sanitized Evidence

Only repository files and sanitized documentation were reviewed. No backup or archive was accessed.

| Evidence | Confirmed result |
| --- | --- |
| Source database family | Self-hosted Supabase PostgreSQL |
| Source image | `supabase/postgres:15.8.1.048` |
| Archive validation | Custom archive header and list-format readability previously passed |
| Default-image collision | The image-initialized identity/authentication schema collided with an archive entry |
| Ownership collision | A pre-existing PostgREST event trigger had an incompatible owner |
| Role limitation | The image's ordinary database role could not restore a function-level PostgreSQL setting |
| Extension collision | Objects supplied by the `supabase_vault` extension also appeared independently in the archive |
| Independent duplicates | A narrowly identified duplicate function was followed by a separate duplicate view |
| Transaction safety | Failed attempts used a single transaction and left no restored production data behind |
| Complete restore | Not achieved |
| Baseline/parity | Not captured because the restore prerequisite failed |
| Proposal/rollback SQL | Not run; production SQL remains unapproved |

Repository schema evidence represents these namespaces and dependencies:

- `public`: Owner application tables, functions, policies, triggers, enums, and indexes.
- `auth`: referenced by `owner_profiles`, `auth.uid()`, `auth.role()`, and the Owner user-created trigger. The repository does not define the complete Supabase `auth` bootstrap.
- `uuid-ossp`: explicitly requested by the Owner schema.
- `supabase_vault`: represented only by the sanitized rehearsal result as an extension-managed collision family.
- PostgREST event-trigger behavior: represented only by the sanitized rehearsal result.

The repository also contains Supabase bootstrap paths for managed and self-hosted deployments. Those runtime provisioning paths are not restore planners and are not changed by this strategy.

## 3. Confirmed Failure Classes And Unknowns

### Confirmed failure classes

1. Bootstrap-managed schema/object already present on the target.
2. Target object ownership differs from archive ownership.
3. Restore role lacks a required privilege for a database/function setting.
4. Extension-managed function/view duplicates appear as independent archive entries.
5. Duplicate classes are not exhausted by the first observed failure.

### Still unknown

- The complete archive catalog and exact archive item IDs.
- The complete source extension list, versions, ownership, membership, and configuration.
- The complete target bootstrap object inventory and deterministic object fingerprints.
- Whether every duplicate is bootstrap-managed, extension-managed, or application-owned.
- Required role/ownership mappings for a complete restore.
- Whether any application-owned object resides in an extension-adjacent or identity-like schema.
- The full restored Owner schema fingerprint and aggregate parity baseline.
- Whether a complete restore can pass before proposal and rollback rehearsal begins.

### Why broad exclusion is unsafe

Schema names do not prove object ownership or extension membership. The Owner schema directly depends on `auth` objects, and an application-owned table or trigger may legally live beside bootstrap-managed objects. Excluding an entire schema, object type, or wildcard pattern could silently remove required application DDL, data, policies, triggers, or dependencies. It would also make skipped entries unreviewable and destroy parity evidence.

## 4. Strategy Comparison

| Strategy | Deterministic inputs | Safety guarantees | Failure modes | Reproducibility / auditability | Existing archive | New backup | Complexity | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Source-matched bootstrap plus exact TOC item policy** | Source/target image versions; sanitized catalog; target object inventory; extension membership/version inventory; exact item ID, schema, type, name, reason, and target fingerprint for every candidate; input and plan hashes | One-to-one review; no wildcard; unknown collision blocks; application objects default to restore | Incomplete inventory, false fingerprint, ownership mismatch, unreviewed duplicate, role incompatibility | High when inputs and plan are hashed and retained; exact IDs make each decision traceable | Compatible in principle | No | High | **Primary**, with Strategy C phase gates |
| **B. Fresh Supabase-aware logical backup** | Separately approved source inventory; extension membership query design; reviewed export policy; new archive checksum/catalog | Avoids known bootstrap/extension duplicates at backup time while retaining application data | Incorrect source-side policy can omit application objects; requires source access and a new backup approval | High only if export policy, inventory, archive, and catalog are versioned and independently reviewed | Does not use the current archive | Yes | Medium to high | **Fallback** if Strategy A cannot reach zero unknown conflicts |
| **C. Controlled staged restore** | Approved Strategy A plan; stage manifests for pre-data, data, post-data; between-stage inventory/fingerprint gates | Limits blast radius and stops before later stages when ownership/membership diverges | Staging alone does not resolve duplicate selection; a wrong exact policy remains wrong | High when every stage is transactional, hashed, and evidenced | Compatible | No | Highest operationally | Required execution overlay for A, not a standalone duplicate-resolution strategy |

## 5. Recommended Primary Strategy

Use **Strategy A**, executed through the phase gates in **Strategy C**.

The target must start from the exact source-compatible Supabase image and an approved bootstrap state. A separately approved operator may later generate a sanitized archive catalog and target inventory. The analyzer in this change compares those two local inputs and surfaces every catalog entry together. Only exact, independently reviewed bootstrap or extension matches may become exclusion candidates. Every other entry remains `restore`, while any target collision without an exact review becomes `unknown_conflict` and blocks the packet.

Strategy C is mandatory during a future execution: pre-data, data, and post-data each require a clean stop boundary and ownership/membership verification. It does not replace the exact policy.

## 6. Recommended Fallback

Use **Strategy B** only if the existing archive cannot produce a zero-unknown exact plan or cannot be restored without unsafe ownership manipulation. It requires a separate Atlas gate for source access and a new backup. The source-side export policy must derive exclusions from verified extension membership and approved bootstrap ownership, never from schema-name patterns. The current archive remains unchanged and retained as evidence.

## 7. Rejected Unsafe Approaches

- Broad schema, wildcard, object-type, owner, or name-pattern exclusions.
- Repeated trial-and-error exclusion after each duplicate error.
- A speculative retry loop that changes the catalog without a complete review.
- Destructive clean/drop behavior against a non-disposable target.
- Restoring into production, staging, Supabase Cloud, or a customer database.
- Using a different PostgreSQL major or Supabase image/bootstrap version.
- Treating elevated restore privileges as proof that ownership/membership is correct.
- Treating the PostgreSQL 16 disposable migration rehearsal as a substitute for the Owner Supabase restore.
- Starting proposal, parity, fake-data, or rollback testing before a complete restore.

## 8. Immutable Restore Invariants

1. Source and target PostgreSQL major plus Supabase image/bootstrap compatibility must be exact and evidenced.
2. The target must be isolated, non-public, disposable, and empty except approved bootstrap objects.
3. Every candidate exclusion must identify the exact archive item ID, schema, object type, and object name.
4. Every candidate must include a stable reason code, expected target object, owner/manager, extension when applicable, and deterministic target fingerprint.
5. Wildcards and schema-wide exclusions are forbidden.
6. Repeated trial-and-error exclusions are forbidden.
7. Any unknown duplicate, ownership ambiguity, fingerprint mismatch, missing ID, or version mismatch stops the rehearsal.
8. Extension ownership and extension membership must be verified independently; schema location is insufficient.
9. Application-owned objects must never be silently excluded. Unreviewed target collisions are `unknown_conflict`.
10. Catalog, inventory, combined inputs, and proposed advisory plan must have deterministic SHA-256 values.
11. The complete advisory plan must be human-reviewable before any use-list is produced or used.
12. No archive entry may be silently skipped; every item receives one classification.
13. Proposal/parity testing cannot start until the restore completes successfully.
14. A generated analyzer report is advisory and never grants execution approval.

## 9. Exact TOC Review Policy

Each reviewed candidate record must contain:

- Exact numeric archive item ID.
- Exact schema (`null` only for schema-less catalog objects).
- Exact object type.
- Exact object name/signature.
- Management class: `bootstrap` or `extension` only.
- Stable reason code.
- Expected target fingerprint.
- Expected extension identity/version when extension-managed.

The target inventory must independently contain the same object identity, management class, and fingerprint. A candidate with a missing catalog ID, mismatched identity, multiple target matches, or mismatched fingerprint is an unknown conflict. Candidate classification does not itself authorize exclusion. An execution use-list may be prepared only after separate human review and Atlas approval; this task does not generate one.

## 10. Extension Ownership And Membership Policy

Before another rehearsal, the approval packet must establish for each extension-managed candidate:

1. Extension name and exact version on source and target.
2. Target extension membership for the exact object.
3. Target object owner and expected bootstrap owner.
4. Stable object definition/fingerprint suitable for that object type.
5. Evidence that the archive item is not application-owned and has no application data payload that would be lost.

An object located in an extension-adjacent schema is not automatically extension-managed. Missing membership evidence is a stop condition.

## 11. Advisory Catalog Analyzer

`apps/owner/scripts/supabase-restore-plan-analyzer.mjs` is a local, non-executing planner. It:

- Reads only two caller-supplied local text files: a sanitized list-format catalog and sanitized target inventory JSON.
- Parses exact numeric item IDs and object metadata.
- Rejects wildcard/schema-wide candidates, duplicate IDs, missing IDs, malformed fingerprints, URLs, and credential-like input.
- Classifies every entry as `restore`, `exact_bootstrap_duplicate_candidate`, `extension_managed_candidate`, or `unknown_conflict`.
- Marks the report `blocked` on any unknown conflict or source/target version mismatch.
- Produces deterministic JSON and Markdown plus SHA-256 values for each input, combined inputs, and the advisory plan.
- Emits no executable restore command or use-list.
- Has no process execution, shell, database, HTTP, or network capability.
- Does not change runtime application behavior.

Every output is marked **NOT APPROVED FOR RESTORE EXECUTION**.

The committed fixtures are synthetic. Names, object IDs, object fingerprints, and versions are invented and do not reproduce archive contents, private object names, PII, credentials, or customer data.

## 12. Restore-Plan Review Process

1. Obtain separate Atlas approval to generate sanitized catalog metadata and target inventory; do not access the archive under this design-only task.
2. Record exact source and target image/version evidence.
3. Build a target inventory from approved bootstrap and extension ownership/membership evidence.
4. Run the non-executing analyzer on local sanitized inputs.
5. Require zero `unknown_conflict`, exact deterministic hashes, and complete entry accounting.
6. Review every candidate row manually with its reason and target fingerprint.
7. Archive the sanitized report and review decision without credentials, URLs, archive contents, or PII.
8. Request a separate Atlas execution gate. Only that future gate may authorize creation/use of an exact use-list and an isolated restore attempt.

## 13. Stop Conditions

Stop before or during a future rehearsal if any of these occur:

- Source/target PostgreSQL major or Supabase image mismatch.
- Target is reachable publicly, non-disposable, non-empty beyond approved bootstrap, or connected to traffic.
- Catalog, inventory, or plan hash differs from the approved packet.
- Missing, duplicate, wildcard, or non-numeric archive item ID.
- Unknown target collision or multiple target matches.
- Ownership, extension version, membership, or fingerprint cannot be proven.
- An application-owned object is proposed for exclusion.
- A new duplicate appears that was not in the approved plan.
- Any stage fails transactionally or leaves an unverifiable state.
- Complete restore, cleanup, parity, or rollback evidence cannot be captured safely.
- Atlas approval does not explicitly cover the exact plan hash and isolated target.

## 14. Required Evidence For The Next Approval

Atlas must review all of the following before another restore attempt:

- Source PostgreSQL/Supabase image/version evidence.
- Target bootstrap image/version evidence.
- Sanitized archive catalog metadata summary, generated under separate approval.
- Sanitized target bootstrap and extension inventory summary.
- Proposed exact-ID candidate policy.
- Candidate reason table with exact identity and target fingerprint.
- Extension ownership/version/membership evidence.
- Zero unknown-conflict confirmation.
- Catalog, inventory, combined-input, and proposed-plan SHA-256 values.
- Isolated target topology: no public network, no traffic, disposable storage, and source separation.
- Transaction and stage boundaries.
- Cleanup plan and proof method.
- Full-restore parity verification plan.
- Proposal and rollback verification plan, to run only after restore success.
- Explicit confirmation that production SQL and runtime cutover remain outside the approval.

## 15. Future Isolated Rehearsal Sequence

After a separate Atlas execution approval:

1. Re-verify approved hashes, image versions, target isolation, and cleanup controls.
2. Verify the target contains only the approved bootstrap inventory.
3. Apply the approved exact-item policy to the pre-data stage and stop on any divergence.
4. Verify schemas, roles, ownership, extension versions, and membership before data.
5. Restore the data stage transactionally and verify complete table/data accounting.
6. Restore the post-data stage transactionally and verify functions, policies, triggers, constraints, ownership, and extension membership.
7. Require complete restore success before collecting baseline and Owner aggregate parity.
8. Only after parity passes, run the separately approved proposal, synthetic constraints, rollback, and post-rollback parity on the isolated target.
9. Destroy the target and archive only sanitized evidence.

No step may continue after an unknown conflict or hash mismatch.

## 16. Production Safety Boundaries

- No backup or archive was accessed while producing this strategy.
- No catalog from a real archive and no real use-list was generated.
- No restore command or restore attempt was run.
- No production, staging, customer, or Supabase Cloud database connection was opened.
- No proposal or rollback SQL was applied.
- Production SQL remains explicitly unapproved.
- No deploy, `deploy/owner` promotion, environment change, or infrastructure mutation occurred.
- `persistent_db_adapter` remains disabled.
- Store creation, provisioning, and auto-provisioning remain disabled.
- Runtime Owner behavior and `owner_*` authority were not changed.

Another explicit Atlas gate is required before backup access, real catalog generation, target inventory collection, exact use-list production, restore execution, or SQL application.
