# Task 8 — new proxy/public helper preparation, 29 September

This is a **new source-only preparation** after root reported that the earlier local `/tmp` artifacts were absent. The cause was not established. The existing 28 September reports/reviews and their historical hashes were read and preserved unchanged. These replacements do not have the former hashes and do not inherit a live execution or independent review pass from them.

No application source, deployment configuration or database changed. No operational helper main, actual HTTP, SSH, Docker invocation, proxy/ACME source read, token, provider operation, backup/install/restore/restart was performed. Tests used only tiny synthetic local fixtures and injected fake transport/metadata.

## New permanent private artifacts

Parent directory `/Users/Celebix/.codex/onboarding-release-20260929` is current-user-owned mode0700. These files are mode0600:

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `proxy-backup.py` | 14975 | `403ed597e700f82373cec92b5c69490c7dab72f21c0aba4bf018ee3981e8c0d2` |
| `public-health.py` (root's fragment correction) | 19471 | `31075997ca3b2dfb3d8c36bbd2c0c510f246b19befd4ba39b41892e14e8dda01` |
| `offline-tests.py` | 17535 | `079beec2c30c6391523247bc4caefa8985b0f0df243f5a793382385224d41fb7` |

The synthetic runner imports the helpers with non-main names and disables new bytecode output. Its earlier two owned bytecode files were retained privately (cache0700/files0600); no broad cleanup or external artifact removal occurred.

## Proxy helper contract

The operational CLI permits only an explicit `--run-server-backup` against fixed source `/data/coolify/proxy` and existing private mode0700 destination `/root/celebix-onboarding-20260928/release`. There are no CLI source/destination overrides. The callable path arguments exist only for the tiny offline fixture tests.

Only `docker-compose.yml`, `acme.json`, and the regular recursive `dynamic` tree are included. All absolute directory ancestors and relative tree directories are opened with directory FDs and `O_NOFOLLOW`; file opens also use `O_NONBLOCK`. Symlinks, nonregular entries, unsafe components, paths over32 components, an inventory over1024 entries or source data over64MiB reject. File/directory device/inode/mode/size/mtime/ctime/uid/gid and complete path membership are compared before and after capture; a fresh no-follow reopening of the fixed source must reproduce the same inventory.

New fixed names `proxy-before-wildcard.tar.gz` and `proxy-before-wildcard-receipt.json` use `O_EXCL`, `O_NOFOLLOW`, mode0600, a mode0700 current-user-owned directory, flush/fsync and no overwrite/remove/retry branch. The archive is bounded to72MiB and hashed from its held FD. Tar entries are only safe relative regular entries and preserve captured source mode/uid/gid/mtime; source contents never enter console/receipt.

Both archive and receipt FDs remain open through final fsync. Final package validation reopens the fixed absolute destination, checks its original device/inode/ownership and private mode, opens both fixed file names without following links, compares named/held frozen file stats, hashes each with expected-size-plus-one bounds, then reopens the fixed destination and jointly checks both named/held identities again after receipt hashing. Late replacement, same-inode rewrite, changed size/timestamps/mode or a different destination rejects and leaves the private uncertain package intact.

Receipt/stdout contain only a fixed scope/name, creation time, bytes/count/hash/boolean stability and optional approved proxy image/imageId/running metadata. Optional metadata requires `--include-proxy-metadata`; its exact Docker command selects only `.Config.Image`, `.Image` and `.State.Running` for `coolify-proxy`, captured with10s timeout. It cannot expose labels or environment arrays. Without that flag no Docker command occurs.

A receipt created before final validation contains the proposed successful result; if final validation rejects, that receipt **does not establish success**. Root must require exit0 plus a matching fixed named package. There is no automatic cleanup or retry. Changes after the completed final validation are outside any filesystem snapshot guarantee.

## Public helper contract

Only explicit `--run-public` starts GET requests; there are no URL/path/host/query overrides. The fixed eight URLs are unchanged from the historical preparation report:

- Owner NET/SITE `/api/health` and `/kayit`.
- `butik-siora.admin.saas-staging.celebix.net/api/health` and `butik-siora.saas-staging.celebix.net/api/health`.
- `admin.guzidekuyumcu.com/api/health` and `guzidekuyumcu.com/api/health`.

Direct standard-library `HTTPSConnection` uses the system CA store, `CERT_REQUIRED` and hostname verification. Only GET, Accept, identity encoding and a fixed User-Agent are sent; there are no cookies, credentials, ambient proxy selection or redirect-following mechanisms. All3xx reject before body reads. Decreasing monotonic/socket budgets are at most25s, with bounded `HTTPResponse.read1` chunks to revisit the deadline between raw reads; JSON is capped at256KiB, HTML at1,000,000bytes. Wrong types, compression, duplicate selected headers, declared/read overflow and malformed/duplicate JSON fields reject. OS DNS and standard-library connect/header parsing are not a guaranteed hard wall-clock cancellation contract.

Health requires200/statusok/no-store. Merchant health additionally requires integer schema1 (boolean rejected), exact fixed hostname and a valid RFC UUID version1–8. Each admin/storefront pair must have the same store ID internally; actual IDs are stripped from all serialized output.

The parser rejects duplicate normalized HTML attributes before dictionary conversion and malformed/nested/unclosed form markup. Readiness must come from one actual visible/enabled POST form under the enabled section, with exact `/api/self-serve/register` action, unique enabled required storeName/storeSlug/privacyConsent inputs, privacy checkbox valuetrue, an enabled internal POST submit, exact visible creation button text and the expected NET/SITE suffix inside that form. Wrong/opposite suffix, disabled/hidden/script/style/template/noscript/inert content, unrelated/decoy controls, form ownership/submit overrides and non-POST forms cannot establish readiness. This remains static HTML readiness, not computed CSS/browser interaction or signed registration E2E.

Output consists only of fixed target names/URLs, HTTP status, booleans and controlled enum categories. Raw bodies/headers/cookies/Location/IDs/error messages never appear. Optional `--output-new` opens every parent ancestor without following links, requires a current-user-owned0700 final parent (or creates only that final parent privately), exclusively creates a0600 file, fsyncs it and the parent, then checks the fixed named parent/file identity. Existing paths and symlinks reject; no existing permissions are changed.

## Offline verification performed

```sh
python3 /Users/Celebix/.codex/onboarding-release-20260929/offline-tests.py
```

The initially reconstructed package passed **18/18**, exit0, at proxy hash `5aafa2b34b1d2fbc94061fe29f786ea626f6b6d1a07348d13ba659de9526f0d5`, public hash `dfb48143f7f6286163d81913c5b5bee663c0c27a0c0e32f781c957ef0e3a9364`, runner hash `6696eabbb352191bd1ea9ffb76b4b73b376d303b92ab31ad88465a518a40f7cc`. Operational mains were not called; default no-I/O guards were checked in the AST before operational call sites.

Nine proxy cases cover ordinary tar/receipt/hash/mode success and exclusive repeat preservation; final destination replacement; final named archive replacement; archive rewrite during receipt hashing; source symlink/FIFO; source change after inventory; public destination/ancestor symlink; source-byte bound/dangling receipt; and fake optional inspector selecting exactly the approved fields. Replacement/rewrite failures preserve the uncertain private synthetic package until its owned TemporaryDirectory cleanup.

Nine public cases cover fixed allowlist/source guard; system TLS/direct GET/headers; all common redirects rejected unread; all eight sanitized results and pair mismatch; invalid schema/host/UUID/cache; same enabled POST form/required fields/suffix/text; six duplicate-attribute regressions; content/declared/read body limits; and new private/exclusive/no-follow output.

The first local test invocation had9 fixture setup/path errors because macOS's default TemporaryDirectory lives under a `/var` symlink and the helpers correctly refused that no-follow ancestor. No proxy snapshot succeeded in that invocation. Fixtures were moved under the known permanent private directory; helper path protections were not weakened. No new actual public health or server backup pass is claimed.

### Root review correction and bounded final verification

Root's source review accepted the backup boundary/no-follow/exclusive structure and requested restoration of original tar member uid/gid/mtime preservation. The narrow final change assigns those values from the captured stat and adds metadata assertions to the ordinary snapshot test. Only the affected ordinary success/exclusive, final destination replacement, final archive replacement and archive-during-receipt-hash tests were rerun: **4/4 passed**, exit0. Both final helper ASTs parsed and final file modes/hashes matched the table above. The full18-test run belongs to the immediately preceding reconstructed hash; it is not represented as a new full run of the final metadata correction.

Public helper code was unchanged from its18/18 version at the initial source handoff; root's subsequent text-fragment correction is recorded below. `git show 3de4bbcdb2808a97e4add42023356b0af2dae046:apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx` independently confirmed the frozen Owner source's exact submit text `Kimliğimi doğrula ve mağazamı kur`, POST/action, required field names, and required privacyConsent checkbox valuetrue. The optional marketing consent is not required by the helper.

### Subsequent root correction and operational evidence

After the preparation/source handoff above, root reviewed both tools and owned their operational execution. Root reported the private proxy snapshot completed successfully with the final proxy403ed597 hash:4 regular files,786862 archive bytes, SHA256 `102963e196e5c4d07865d26aba0eff693a2be3517b8fbb7aa60bbed543482d5b`, private archive/receipt mode0600. This author did not execute the server helper or independently inspect that operational receipt; the actual root evidence is separate. No proxy install/restart/provider operation was included.

Root's first public run passed6/6 health checks; both registration endpoints returned200 with the active correct POST/action/required inputs/submit, but the helper's suffix check failed. Root's safe DOM diagnostic established a helper parser defect: `' '.join` inserted an artificial space between React's adjacent `'.'` and suffix text fragments. Root narrowly changed the form/submit text joins to`''.join`, preserving actual text concatenation. Final public source hash is the table's31075997 value; the old18/18 source hash is historical, not a full rerun claim for this correction. Root reported3/3 tiny local fragment checks passed: actual adjacent fragments accepted, an explicit bad space rejected, and a foreign split SITE suffix rejected. Root then reported its actual fixed eight-target run passed **8/8** at hash31075997. This is root-owned public HTTP/static HTML evidence, not native browser interaction, signed202/session/status-cookie/handoff E2E or new-host wildcard TLS proof. No additional HTTP was performed by this author.

An additional source-review timing qualification was sent to root without modifying the accepted source: when a response uses`Connection: close`, standard-library`HTTPSConnection` can clear`connection.sock` while the response retains the read socket. Body`read1` still checks the monotonic deadline between bounded reads and rejects accepted results beyond25s, but the response-owned socket may retain its earlier≤25s timeout instead of a decreasing remaining budget. Thus the request has bounded socket/read/byte work and no retry, but this helper does not guarantee a strict25-second total wall-clock bound for every connection/body phase. This qualification joins the documented OS DNS/connect/header cancellation limits.

## Root handoff

Root must review these newly hashed sources before operational use. The private server copy/explicit backup run and real public GET execution belong to root. Proxy installation, token approval, wildcard TLS, feature activation, signed browser E2E and payment execution remain separate gates.

After review, fixed commands are:

```sh
python3 /root/celebix-onboarding-20260928/release/proxy-backup.py --run-server-backup --include-proxy-metadata
python3 /Users/Celebix/.codex/onboarding-release-20260929/public-health.py --run-public --output-new /Users/Celebix/.codex/onboarding-release-20260929/public-health-final.json
```

Neither command was run by this author.
