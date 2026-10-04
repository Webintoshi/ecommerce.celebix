# Final live-backup integration and rollback gate

## Result

PASS. The final live backup was restored into `celebix_owner_final_acceptance_20261004`. Current SQL209 → SQL210 → SQL211 → final trusted-issuer SQL212 migrations and every native assertion passed. Support lifecycle and SQL208 POS financial/pause fixtures passed. SQL212 → SQL211 → SQL210 → SQL209 down then restored every recorded baseline object and business row exactly. The disposable clone was removed after verification. The earlier acceptance database was not touched.

## Backup and source proof

- Source backup: `/root/celebix-private-backups/platform-before-209-final-20261004.dump`.
- Backup SHA256: `9c0e3d10deaa11ab599eff1b79fd34229a2acaa12e0aca724c73a33e49845bc2`.
- Backup size: 53,590,638 bytes; private mode 0600.
- Before-manifest SHA256: `d0099966a6a7de6447e009a197f80795e9c4351a4d85f271e4f8d3978af4842a`.
- After-manifest SHA256: `d0099966a6a7de6447e009a197f80795e9c4351a4d85f271e4f8d3978af4842a`.
- Source-file manifest SHA256: `76441d2c93823a48cbd073fef610fff3386ca6ccb0c8034ddf51b2888de9d080`.
- Every recorded migration, assertion and fixture source still matched that source manifest after the gate and cleanup. This includes SQL212's required trusted-issuer arguments and immutable identity_issuer.
- Missing entries: 0. Extra entries: 0. Changed entries: 0.

Private reproducible evidence is in `.codex-artifacts/platform-support/final-restoration/`: before/after JSON, source manifest, proof JSON, source scripts and native logs. These contain row fingerprints, never raw business rows. Files use mode 0600 and the directory mode 0700.

## Complete recorded baseline

| Scope | Count | Compared |
|---|---:|---|
| Native functions | 1,599 | Signature, SHA256 definition, owner and ACL |
| Business tables | 300 | Row count and sorted whole-row content fingerprint |
| Business rows | 384,760 | Preserved across all table fingerprints |
| Relations | 304 | Type, owner, ACL, RLS and forced RLS |
| Indexes | 872 | Definition and owner |
| Constraints | 2,578 | Definition |
| Triggers | 233 | Definition and enabled state |
| RLS policies | 43 | Predicate, command, roles and permissive mode |
| Sequences | 2 | Last value and called state |
| Total entries | 5,931 | Exact before/after JSON equality |

The manifest's persistent data reads ran inside READ ONLY transactions; its scratch table was temporary and disconnected afterward. No production schema or data changes were made by this task.

## Native acceptance

- SQL209: restricted roles; optimistic version, replay/mismatch and global keys; 11,000/5,000/6,000 finances; reversal and append-only records; frozen package publication; assignments/downgrade limits; attested POS/open debt protection; ownership, invitation and immutable identity checks; per-store separation; wrapped support and pause commands; hash-only handoff persistence.
- SQL210: restricted support runtime; no old two-argument redemption; fixed host/session/expiry; exact matching cookie recovery after lost commit response; revoke and expiry denial; real operator/plan; staff and quota exclusions; native atomic write journal; durable initiating journal across worker completion after support revocation.
- SQL211: read-only overview; eligible verified workflow requirements; active lease rejected/expired lease retryable; awaiting-identity retry rejected; version/idempotency/audit atomicity; inactive operator denial.
- Final SQL212: required trusted issuer for creation/read; same-email foreign issuer excluded and rejected; verified email, browser and host binding; frozen subject; expiry; replay; membership-only onboarding with unchanged store/workflow counts; last owner and atomic transfer.
- SQL208 POS regression: full/partial/zero collection, new admission paused, existing same-key replay retained, normal manager finishes a received support sale after revocation, stock decremented once, later collection, product return and refund.
- Original SQL208 exact timing assertion passed before migration and after rollback, preserving source hashes, definition, owner, ACL, function characteristics and timing anchor checks.

## Restore-specific exceptions

`pg_restore` recreates function OIDs, while SQL208's persisted backup row stores its original production function_oid. Only the isolated SQL208 assertion comparison was adapted from that stale OID to its verified regprocedure signature. The original SQL208 source and backup rows were untouched; all hash/definition/owner/ACL/timing checks remained active. Root acknowledged this adaptation.

The standard restored pg_trgm extension recreates 31 extension functions under the clone creator, so their baseline owner/ACL values differ from live production before migration. These extension exceptions were recorded. Their clone-baseline definitions, owners and ACLs still restored exactly after the complete up/down cycle. No application-function authority exception or drift was introduced.

## Cleanup and release boundary

The fresh disposable database had no active connections when dropped. Its absence was verified. Original backup, old acceptance DB, production credentials and production data were preserved by this task. Root owns the production native transaction, the shared release lock, environment and payment-proof guard, rollout and live account/MFA acceptance. This gate resolves the final SQL212 checkpoint limitation in task-2-final-review.md.
