# Task 8 — fixed public health helper preparation

## Owned deliverables

- New helper: `/tmp/celebix-onboarding-public-health-20260928.py` (mode `0600`).
- This report only. No application source, deployment, provider/auth action or real HTTP request was performed.
- Helper SHA256: `df2e56cc6434e00ab170fc8facabe38692b34f7c31725e34d5f9a59971db62b6`.

The eight URLs are copied exactly from `/tmp/celebix-owner-onboarding-health.py`. The new helper does not accept URL/host/path overrides or query strings.

| Named target | Fixed public URL |
| --- | --- |
| owner_net_health | `https://owner.saas-staging.celebix.net/api/health` |
| owner_site_health | `https://owner.saas-staging.celebix.site/api/health` |
| siora_admin_health | `https://butik-siora.admin.saas-staging.celebix.net/api/health` |
| guzide_admin_health | `https://admin.guzidekuyumcu.com/api/health` |
| siora_storefront_health | `https://butik-siora.saas-staging.celebix.net/api/health` |
| guzide_storefront_health | `https://guzidekuyumcu.com/api/health` |
| owner_net_registration | `https://owner.saas-staging.celebix.net/kayit` |
| owner_site_registration | `https://owner.saas-staging.celebix.site/kayit` |

## Transport and checks

The transport uses direct standard-library `HTTPSConnection` with the system trust store, `CERT_REQUIRED` and hostname verification. It uses GET only, sends no authentication/cookie/tenant override headers, and does not consult ambient proxy settings. There is no redirect-following machinery: every 3xx response is rejected before its body is read, including redirects to the same URL/host. It never outputs Location, response headers, cookies, nonce, exception messages, raw bodies or actual tenant IDs.

Connection/socket timeouts are at most 25 seconds. The monotonic deadline decreases the remaining header/body socket budget; body reads are chunked and bounded to 256 KiB for JSON or 1,000,000 bytes for HTML. Compressed content and wrong content types fail closed. DNS resolution is performed by the standard system resolver; this is not a separate hard cancellation guarantee for OS DNS lookup. Exactly eight fixed targets run with `max_workers=8` and no retry loops.

Owner health requires HTTP 200, JSON `status: ok` and `cache-control: no-store`. Each known merchant admin/storefront health also requires integer `schemaVersion: 1` (boolean rejected), exact hostname and a valid version 1–8/variant UUID. Siora and Guzide admin/storefront IDs must each match within their pair. IDs are retained only inside the check invocation and are stripped from serialized output; pair mismatches fail both otherwise valid members.

Registration checks parse actual HTML rather than matching an unrelated submit button. The enabled section must contain a POST form with exact action `/api/self-serve/register`, enabled submit, required store name/slug/privacy inputs and its expected `.saas-staging.celebix.net` or `.saas-staging.celebix.site` suffix. The opposite suffix is rejected within the form. The approved creation text must be visible; script/style/template/hidden text is excluded. Nothing is submitted and no external page resource is fetched.

Output contains only fixed named targets/URLs, HTTP status, boolean checks/pass and sanitized error categories, plus aggregate read-only/public-health/pass booleans. Optional output uses a new selected parent directory with mode `0700` (or requires an existing current-user-owned `0700` parent), an exclusive no-follow new file and mode `0600`. Existing files and symlinks are refused; no existing directory permissions are changed.

## Verification performed

```sh
python3 /tmp/celebix-onboarding-public-health-20260928.py --self-test
```

**11/11 fake-only unit tests passed**, exit 0. Coverage includes fixed allowlist/TLS settings; successful sanitized payloads; all common redirects with same/external Location and private cookies; schema/host/UUID/cache failures; pair mismatch; disabled/wrong-action/wrong-suffix/decoy registration content; JSON/form limits/content encoding/type; timeout/deadline and 404/503 errors; exactly eight concurrent targets; and exclusive private output files/directories. The initial stub run failed on the unimplemented transport/check/output seams before implementation. Final AST syntax check passed. Running with no mode exits 2 before a request: explicit `--run-public` is required.

**Real public HTTP execution: not run.** This report is source preparation evidence, not a new public health pass. The prior eight-target health baseline belongs to the parent evidence.

## Parent command after all six deployments

```sh
python3 /tmp/celebix-onboarding-public-health-20260928.py --run-public
```

Optional new private evidence file:

```sh
python3 /tmp/celebix-onboarding-public-health-20260928.py --run-public \
  --output-new /tmp/celebix-onboarding-public-health-evidence-20260928/public-health.json
```

The helper returns exit 0 only if all eight checks and both tenant pairs pass; check failures exit 1, CLI/output failures exit 2. This is public health/form readiness only. It does not prove signed registration/login E2E, wildcard TLS for a newly registered hostname, object storage rendering, orders or payment/provider execution.
