# Task 8 — independent private proxy backup helper review

Reviewed source: `/tmp/celebix-onboarding-proxy-backup-20260928.py`, SHA256 `776faf588663b35a58912a5167184b76a7fa4b62a19ae17de3660b71a88a8357` (matches the requested stable version), and `task-8-proxy-backup-helper-report.md`.

**Disposition: one P2 finalization blocker reproduced.** No helper edit, helper main, remote operation, actual proxy/ACME source read, Docker invocation, provider call or operational restart/install was performed. This review writes only this report; unit fixtures contained tiny synthetic bytes and were removed by `TemporaryDirectory`.

## P2 — named backup package is not revalidated after receipt creation

Source lines 185–188 validate the named archive inode/mode, then lines 189–193 hash the open archive. Lines 195–201 reopen and validate the destination's absolute identity/private mode. These checks happen before the receipt is opened and fsynced at lines 207–214; success returns at line 215 without another named-package check.

Two independent tiny synthetic function-level repros injected a single replacement immediately before the receipt `os.open` call:

1. Rename the destination directory and create a new private directory at the same path. `create_backup` returns `pass: true` while archive and receipt are written to the old anchored directory; the fixed destination contains neither file.
2. Replace the named archive with another tiny regular file. `create_backup` returns `pass: true`, and the named archive's SHA256 differs from the returned/written receipt SHA256.

The FD anchoring prevents an unsafe source/path escape, but the receipt can claim a completed package that is absent or different at its fixed destination. This matters because downstream root execution is instructed to rely on the named receipt/hash before proxy work.

Required bounded fix: keep expected archive/receipt descriptor identities, fsync both files and the destination, then reopen the fixed destination and validate its inode/private mode plus both named regular files' inode/mode/size and the archive digest before returning success. Revalidate file stability around the digest read. A changed/uncertain package must fail closed and remain private for explicit review; do not overwrite/delete/retry automatically. Add the two receipt-boundary synthetic regressions above. As with every filesystem snapshot, later changes after the helper has completed remain outside its success boundary.

## Confirmed protections

- CLI scope is the fixed compose file, ACME file and dynamic tree under the fixed source. No whole-host archive, extraction, restore, source write or provider command exists.
- Absolute directory ancestors and dynamic traversal are opened component by component with directory FDs and `O_NOFOLLOW`. Regular sources are checked before/after reads, and before/after inventories compare device/inode/mode/size/mtime/ctime/uid/gid and tree membership.
- Symlink and non-regular sources fail closed; opened sources use `O_NONBLOCK`, so a raced FIFO cannot block before the regular-file check.
- File/directory/name/depth/total-source-byte bounds are explicit. Tar member names are safe relative regular entries. No actual source content or secrets enter JSON/stdout.
- Private outputs use exclusive no-follow creation, mode `0600`, a mode `0700` destination, flush/fsync and sanitized failure codes. An existing archive/receipt, including a dangling symlink, rejects a rerun. Source errors may leave a partial private archive without a success receipt; the preparation report accurately requires explicit review.
- Docker metadata selection is limited to the exact proxy's image/imageId/running fields and a 10-second captured invocation; unavailable metadata is explicitly represented. No labels/env/private ACME material are emitted.

## Independent synthetic verification

Loaded the helper with a non-main module name and injected `inspect=lambda: {"available": False}`. No actual Docker subprocess ran. Only helper functions and tiny local synthetic files were exercised.

| Case | Result |
| --- | --- |
| Normal three-file snapshot | Success; receipt digest/size/count matched; archive/receipt mode `0600` |
| Destination replacement at receipt open | **False success reproduced**; fixed destination missing archive/receipt |
| Archive replacement at receipt open | **False success reproduced**; named archive hash differs from receipt |
| ACME symlink | Rejected, no success receipt |
| Dynamic FIFO | Rejected without blocking, no success receipt |
| Source changed after inventory | Rejected, no success receipt |
| Existing dangling receipt symlink | Rejected before package creation |
| Public `0755` destination | Rejected, no success receipt |

Both local Python invocations exited 0 because their assertions confirmed the specified success/rejection or reproduced false-success behavior. Output was limited to case names and booleans. Actual source reads, Docker calls and helper-main executions: **0**. This is source/synthetic review evidence, not a completed server backup or restore test.
