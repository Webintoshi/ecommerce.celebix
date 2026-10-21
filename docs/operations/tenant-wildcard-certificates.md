# Tenant wildcard certificates

## Ownership and scope

ROOT is the sole live operator. The repository helper and offline tests prepare issuance, renewal, and publication; running tests or `plan` performs no Docker, ACME, DNS, application deployment, or database operation. ROOT separately reviews the image, token, configuration, initial issuance, publication, and timer installation.

Use two certificates, one per DNS zone. Each contains exactly these two SANs:

| Certificate | Storefront wildcard | Admin wildcard |
| --- | --- | --- |
| NET | `*.saas-staging.celebix.net` | `*.admin.saas-staging.celebix.net` |
| SITE | `*.saas-staging.celebix.site` | `*.admin.saas-staging.celebix.site` |

Separate zone state permits independent ACME renewal and recovery. Publication validates both certificates and all four names together. A failure in either zone preserves the active dynamic file, even if renewal succeeded for the other zone. The wildcards cover one tenant label; they do not cover the zone apex or additional nested labels.

## Required host state

The existing Traefik file provider must already watch `/data/coolify/proxy/dynamic`, with host `/data/coolify/proxy` mounted as `/traefik`. Traefik must be able to read root-owned 0600 files. ROOT verifies these conditions before applying. This helper does not edit static provider configuration or restart Traefik.

New state is confined to `/data/coolify/proxy/celebix-wildcard-tls`:

- `state/net` and `state/site`: separate Lego account, certificate, and renewal metadata.
- `published/<zone>/<content-hash>/fullchain.pem` and `key.pem`: immutable published versions.
- `.manager.lock`: exclusive local manager lock; overlapping runs fail immediately.

Managed directories are 0700; managed files and keys are 0600. Existing state is checked for symlinks, hardlinks, foreign ownership, and special files before starting Lego, then hardened again afterward. The helper does not read, modify, migrate, or delete existing Traefik ACME storage, certificates, routers, or applications.

The only dynamic file it publishes is `/data/coolify/proxy/dynamic/celebix-tenant-wildcard-tls.yml`. An existing file without this manager's exact marker and structure is refused. Published configuration contains only `tls.certificates` with two immutable path pairs. JSON following a YAML comment is valid YAML.

## Image and token

Use the official `goacme/lego` v4 image with a reviewed immutable digest. ROOT resolved v4.35.2:

- Docker index: `sha256:ae124a405844759b201b31efbd7a0ba302dbd16e86f2fb177c4b6db8bdc782c8`.
- Linux amd64 child: `sha256:0d7403f7c89022d51af9662813cac7ea54e9c3b26c5551bec0a829014ddcafd6`.

ROOT pulls and verifies the selected image separately. The helper uses `--pull never`. ROOT verified the actual v4.35.2 CLI supports `renew --days 30 --ari-disable`; help also needs a writable `--path` under the read-only container filesystem. Do not substitute a v5 tag: its CLI contract differs.

The Cloudflare API token must have only Zone Read and DNS Edit for `celebix.net` and `celebix.site`. ROOT creates or retrieves it only through the authorized process, writes it outside the proxy mount in a root-owned 0600 regular file, and ensures the parent is private. The approved deployment also restricts token source IP to the server's IPv4 address. ROOT verifies Docker DNS/API egress uses an allowed source; no host-network fallback is included.

The token is mounted read-only at `/run/secrets/cloudflare-token`. Only `CF_DNS_API_TOKEN_FILE=/run/secrets/cloudflare-token` enters the container environment. The helper checks file metadata without reading the token. Token contents never enter arguments, Docker environment literals, output, or configuration. The container receives no Docker socket, host network, ports, or extra capabilities. It runs as UID 0 to write root-private state, with a read-only root filesystem and writable private state/tmp mounts. The state bind target and Lego `--path` are `/var/lib/lego`: the official image uses `/lego` as its executable, so mounting a directory there fails before Lego starts.

References: [Lego Cloudflare token permissions and `_FILE` support](https://go-acme.github.io/lego/dns/cloudflare/), [official Lego source](https://github.com/go-acme/lego), [Traefik dynamic user certificates](https://doc.traefik.io/traefik/reference/routing-configuration/http/tls/tls-certificates/).

## ROOT installation and first issuance

Install the reviewed helper at `/usr/local/libexec/celebix/tenant-wildcard-certificates.py`, owned by root, mode 0755. Place the configuration at `/etc/celebix/tenant-wildcard-certificates.json`, owned by root, mode 0600. Choose the real operator email and token path; the example email is deliberately unusable.

```json
{
  "schemaVersion": 1,
  "rootReviewed": false,
  "legoImage": "goacme/lego:v4.35.2@sha256:ae124a405844759b201b31efbd7a0ba302dbd16e86f2fb177c4b6db8bdc782c8",
  "email": "ops@example.invalid",
  "cloudflareTokenFile": "/etc/celebix/tenant-wildcard-secrets/cloudflare-token"
}
```

Review the generated command plan first; this does not read the token or create proxy state:

```sh
python3 /usr/local/libexec/celebix/tenant-wildcard-certificates.py plan --config /etc/celebix/tenant-wildcard-certificates.json
```

After ROOT completes review, set `rootReviewed` to `true`. Initial issuance requires both root identity and an explicit apply flag:

```sh
python3 /usr/local/libexec/celebix/tenant-wildcard-certificates.py issue --config /etc/celebix/tenant-wildcard-certificates.json --apply
```

`issue` uses `run` only when all three certificate resources are absent. Existing complete resources use the renewal command, making repeat issuance safe. Partial state is refused. `renew` always requires complete prior certificate/key/metadata resources; it never silently creates a new order. Each zone command is bounded to 1,500 seconds, and both zones are attempted before reporting a zone failure.

Before changing the dynamic file, the helper freezes and validates both full chains and keys: exact per-zone SAN sets, matching public keys, trusted system CA chain with server purpose, current validity, and at least 30 days remaining. Production trust is `/etc/ssl/certs/ca-certificates.crt`; the CLI cannot replace it. Validation failures preserve the active dynamic file.

Successful publication writes new immutable versions first, syncs them, then atomically replaces only the manager's dynamic file. Its previous bytes are checked again before replacement. An unchanged valid publication does not replace the file. Existing versions are retained. If a local failure occurs after atomic replacement, inspect the active file before retrying; the helper reports this uncertainty explicitly.

ROOT verifies Traefik has loaded the new certificates using concrete tenant storefront/admin hostnames in both NET and SITE, including issuer, SAN coverage, expiry, and HTTPS health. Confirm existing unrelated routes remain healthy. A successful helper exit proves local validated publication, not remote Traefik acceptance or external TLS health.

## Daily renewal

The persistent installation uses the canonical helper, configuration, and token paths shown above. ROOT enables the timer only after initial issuance, a successful real renewal no-op, and external NET and SITE TLS verification. The unit below describes that reviewed installation. The helper must have created its managed namespace before the service's write-path sandbox is enabled.

`/etc/systemd/system/celebix-tenant-wildcard-certificates.service`:

```ini
[Unit]
Description=Renew and publish Celebix tenant wildcard certificates
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/libexec/celebix/tenant-wildcard-certificates.py renew --config /etc/celebix/tenant-wildcard-certificates.json --apply
TimeoutStartSec=55min
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/data/coolify/proxy/celebix-wildcard-tls /data/coolify/proxy/dynamic
```

`/etc/systemd/system/celebix-tenant-wildcard-certificates.timer`:

```ini
[Unit]
Description=Daily Celebix wildcard renewal check

[Timer]
OnCalendar=*-*-* 03:35:00 UTC
RandomizedDelaySec=1h
Persistent=true
Unit=celebix-tenant-wildcard-certificates.service

[Install]
WantedBy=timers.target
```

ROOT reviews and installs these units; the repository helper does not install, enable, or start them. No immediate issuance service is scheduled. The service's 55-minute budget exceeds two 25-minute zone commands. The renewal policy explicitly uses the fixed 30-day threshold and disables ARI scheduling. ROOT monitors service failures and certificate expiry independently; no notification integration is installed here.

## Failure recovery and rollback

The helper emits only source-defined bounded error codes. Provider stdout/stderr are suppressed and Docker logging is disabled; neither token nor key data should be copied into diagnostics. Zone failures identify `net`, `site`, or both. ROOT can inspect private state and certificate metadata locally without exposing credentials.

A Docker CLI timeout does not guarantee its container exited. Fixed names `celebix-tenant-wildcard-net` and `celebix-tenant-wildcard-site` prevent a subsequent cycle from creating a parallel writer. **Stop both the timer and service during recovery.** Stopping a timer alone does not stop an already-running service. ROOT stops `celebix-tenant-wildcard-certificates.timer` and `celebix-tenant-wildcard-certificates.service`, waits until the service is inactive, and verifies there is no holder of the manager lock. ROOT then inspects any surviving container's exact name, reviewed image digest, and `celebix.manager=tenant-wildcard-certificates-v1` label before stopping/removing that specific owned container. Verify both owned containers are absent or stopped before modifying state. No automatic cleanup, forced issuance, broad container removal, or provider retry is performed. The private token mount can remain present while such a container survives, so recovery is required before re-enabling the timer.

If a zone fails, repair its isolated private Lego state and rerun `renew`; successful state from the other zone remains available. ROOT may run `publish --config ... --apply` to validate and publish already-existing state without any ACME or DNS call; it still checks the token file's metadata. Do not delete renewal metadata to force an order.

For rollback, stop both the timer and service, wait for the service to become inactive, verify no manager lock holder, and inspect/stop any surviving exact manager-owned containers as above. Acquire the existing `.manager.lock` exclusively using the same advisory `flock` protocol and hold it throughout backup, validation, and atomic restoration; refuse rollback if the lock cannot be acquired. Retain the current manager file as a private backup and inspect a previously published pair of versions. ROOT must revalidate both pairs' trust, exact SANs, matching keys, and expiry before atomically restoring a manager-only dynamic document pointing to those immutable paths. Confirm external TLS again before releasing recovery controls or re-enabling the timer. There is no automatic rollback or certificate deletion. Unreferenced versions and `.unpublished-*` leftovers may be inspected and cleaned by ROOT later; never remove a path referenced by the active file.

## Offline verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/tenant-wildcard-certificates.test.py
```

Eleven deterministic tests cover command restrictions, bounded secret-safe failures, exact SANs, cryptographic trust/key/expiry checks, immutable idempotent publication, unrelated-file preservation, failed-zone/atomic-write preservation, absent renewal metadata, and unsafe state rejection before Docker. They generate temporary local certificate fixtures and inject an ephemeral test CA directly into internal functions; they perform no Docker, ACME, Cloudflare, or live proxy operation.
