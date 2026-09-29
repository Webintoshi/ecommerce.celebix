# Task 5 local research transport candidate

This subtask implements only `apps/customer-panel/lib/content-research/{authority,fetcher,extract}.ts` and their offline tests. An independent security review found three bounded issues; all three were reproduced with failing offline tests and corrected. No external URL, provider, database, production endpoint, or TLS server was contacted.

## RED → GREEN

- RED: `node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/content-research/*.test.ts` failed in both test files because `extract.ts` and `fetcher.ts` did not yet exist.
- Review RED: added three tests for decoded entity controls, whitespace-only `<title>` fallback, and a transport returning a response after timeout. The same command passed 11/14 and failed exactly those three tests before corrections.
- GREEN: the same command passed 14/14 offline tests after correction. Decoded title/body text is checked for controls before whitespace normalization; title fallback uses the first visible heading; late responses are discarded even after the outer timeout has settled.
- Scoped strict TypeScript check of all five Task 5 files passed with `tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --skipLibCheck --strict --types node ...` (exit 0).
- A full customer-panel typecheck was attempted and exited 2 due to concurrent, outside-scope `@zxing/library` resolution in `lib/barcode-labels/outputs.test.ts` and `packages/saas-contracts/src/content-resource-authoring/validation.ts`. An initial Task 5 `findLastIndex` target mismatch was corrected, then the scoped check passed. These full-project failures are not presented as Task 5 success.

## Implemented boundary

- Canonical HTTPS only; no credentials, fragment, alternate port, IP literal, localhost/local/internal/lan/home name, or parser-repaired user URL. Every DNS answer must match its declared family and pass the existing feed public-address classifier. The selected numeric answer is pinned into the HTTPS connection while Host, SNI, and certificate-name verification use the validated hostname.
- Redirects are manual (at most three), discard their responses, and revalidate/re-resolve each destination. No cookies, authorization, proxy agent, assets, script execution, crawler or model tools.
- Only `text/html` and `text/plain` UTF-8 under identity encoding. Content length and actual chunks are bounded at 524,288 bytes; mismatches, invalid UTF-8, unsupported media and encodings fail closed. Each source is bounded by 10 seconds and the caller's earlier monotonic deadline, including DNS, stream, extraction, and synchronous completion checks. An abort closes an active response.
- `htmlparser2` text extraction skips scripts, styles, templates, forms, navigation, hidden and aria-hidden subtrees. It limits element depth to 64, nodes to 20,000, and normalized UTF-8 evidence to 12,000 bytes without truncation. The display title may shorten to 500 UTF-8 bytes; the retained text and its SHA-256 digest remain exact. Returned evidence contains original/final URL, timestamp, ID, raw byte count, text and digest.

## Remaining integration boundaries

- The Task 5 service must enforce 1–3 explicit URLs, 20 seconds overall, 32,000 combined extracted bytes, persistent actor/tenant evidence, quotas, fencing and idempotency. None are claimed by these pure modules.
- `htmlparser2` 8.0.2 is already present in the root lock via another package, but the customer-panel package must declare it directly during Task 5 integration as the plan requires. Package files were intentionally outside this assignment.
- The fetcher expects `deadlineAt` and injected `now()` in monotonic milliseconds (`performance.now()` clock). The integration must pass its HTTP budget in that clock.

The five-file SHA-256 manifest is `task-5-fetcher-source-manifest.json` in this directory.
