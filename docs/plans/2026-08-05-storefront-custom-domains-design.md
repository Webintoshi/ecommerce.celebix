# Storefront Custom Domains — Design

**Date:** 2026-08-05  
**Status:** Approved for implementation planning  
**Scope:** Customer storefront custom domains only. Tenant admin origins remain on Celebix-controlled hostnames.

## Decision

Celebix will provision storefront custom domains with Cloudflare for SaaS. Cloudflare will own edge hostname validation, certificate issuance, and customer-domain traffic termination. A Celebix-controlled CNAME target will route validated custom hostnames through a private Cloudflare Tunnel to the shared storefront runtime. Coolify remains the application runtime and deployment authority; it does not become the per-merchant certificate or hostname control plane.

Every store retains its Celebix platform hostname as a permanent fallback. A custom hostname becomes primary only after Cloudflare reports both the hostname and its certificate as active and the Celebix ingress health check succeeds for the exact hostname.

## Goals

- Let a merchant connect a storefront domain from `Ayarlar > Alan Adı` without providing Cloudflare credentials.
- Keep tenant selection derived exclusively from the normalized request hostname.
- Provision and renew HTTPS without a Coolify reconfiguration or application deployment per merchant.
- Expose real DNS, hostname, certificate, and origin-health state in a minimal interface.
- Preserve the Celebix platform subdomain during setup, failure, removal, and recovery.
- Make create, verify, activate, make-primary, and remove operations idempotent and auditable.

## Non-goals

- Custom admin-panel hostnames.
- Wildcard customer hostnames.
- Customer-managed Cloudflare API tokens.
- Moving customer DNS zones or nameservers to Celebix.
- Making an unverified hostname canonical.
- Enterprise-only apex proxying in the first release.

## Existing foundation

The codebase already has most of the request-side foundation:

- `saas.store_domains` supports platform and custom storefront hostnames, pending/active/disabled state, one active primary hostname, verification timestamps, and versioning.
- Public storefront resolution uses an exact active hostname and resolves the owning store in PostgreSQL.
- The shared storefront runtime already renders multiple stores from hostname-derived authority.
- Tenant provisioning already creates the permanent Celebix platform hostname.

The missing layer is the provider lifecycle: Cloudflare API authority, DNS/certificate reconciliation, merchant-facing APIs, operations/audit state, and the settings interface.

`saas.domains` remains the tenant-bootstrap record for the platform domain. `saas.store_domains` is the public storefront hostname authority. Custom storefront domain workflows write only through a database function that keeps these responsibilities explicit; direct table mutations remain forbidden.

## Architecture

```text
Merchant DNS
  www.brand.example CNAME shops.celebix.site
                |
                v
Cloudflare for SaaS Custom Hostname
  - hostname validation
  - SSL certificate validation and renewal
  - edge TLS and protection
                |
                v
Celebix fallback origin
  shops-origin.celebix.site -> Cloudflare Tunnel
                |
                v
Shared storefront runtime on Coolify
                |
                v
PostgreSQL exact-host resolver
  hostname -> store_id -> storefront data
```

The Cloudflare Tunnel uses outbound-only connections and a final ingress rule that forwards accepted HTTP traffic to the shared storefront service. The application still rejects any hostname that is not an active `saas.store_domains` record. Cloudflare reachability is not tenant authority.

## Domain lifecycle

### 1. Create request

The merchant enters a hostname such as `www.brand.example`. The server:

1. trims a trailing dot;
2. lowercases and converts Unicode input to an ASCII A-label;
3. rejects schemes, paths, ports, IP addresses, wildcard labels, local/reserved names, Celebix-owned names, and invalid public suffixes;
4. enforces global hostname uniqueness;
5. enforces membership permission, plan feature, and custom-domain limit;
6. creates an idempotent pending operation and a pending `saas.store_domains` row;
7. creates the Cloudflare custom hostname with a minimum TLS version of 1.2;
8. stores the opaque Cloudflare custom-hostname ID and returned validation records.

The API never accepts a `store_id`, provider ID, certificate state, or primary flag from the browser.

### 2. DNS instructions

The interface shows one preferred record:

```text
Type:   CNAME
Name:   www
Target: shops.celebix.site
```

The exact record name is derived from the requested hostname and its registrable domain. Values come from server configuration and provider response, never from static client fixtures.

The first release recommends a subdomain such as `www`. A zone apex is accepted only when its DNS provider supports an equivalent flattened CNAME/ALIAS workflow. Otherwise the merchant is instructed to use `www` and redirect the apex. Cloudflare Enterprise Apex Proxying is outside the first-release dependency set.

### 3. Reconciliation

Provisioning is asynchronous. A server-side reconciler polls Cloudflare using the opaque provider ID and records independent truth for:

- hostname activation;
- SSL certificate issuance;
- DNS target observation;
- exact-host Celebix origin health.

The UI state is a projection of those facts:

| UI state | Required facts |
| --- | --- |
| `DNS bekleniyor` | Provider record exists; DNS target is not observed |
| `Doğrulanıyor` | DNS observed; hostname is not active |
| `SSL hazırlanıyor` | Hostname active; SSL is not active |
| `Bağlanıyor` | Hostname and SSL active; exact-host health is not confirmed |
| `Aktif` | Hostname, SSL, DNS, and exact-host health are ready |
| `İşlem gerekli` | Provider or DNS has a recoverable validation error |
| `Devre dışı` | Removal/disable workflow completed |

Webhook delivery may accelerate reconciliation later, but polling remains the durable source of convergence. Repeated events and retries must not duplicate provider hostnames or database rows.

### 4. Activation and canonicalization

Activation is a database transaction that locks the store's domain set and rechecks provider readiness. Only an active custom hostname can become primary. Changing primary increments versions and leaves the Celebix platform hostname active as a fallback alias.

Requests arriving on an active non-primary hostname receive a permanent redirect to the active primary hostname. During provisioning and provider failure, the Celebix platform hostname remains canonical. Customer-account links, checkout receipts, magic links, and canonical SEO URLs use the current database primary hostname at generation time.

### 5. Removal

Removal first prevents new primary selection, moves canonical traffic back to the platform hostname if necessary, disables the local hostname, and then deletes the Cloudflare custom hostname. Provider deletion is retried until confirmed. The hostname and audit history are retained for a cooldown period before another store may claim the same name.

## Data model

`saas.store_domains` remains the serving authority. Add provider-specific state outside that table:

### `saas.store_domain_provisioning`

- `domain_id` primary/foreign key
- `provider` fixed to `cloudflare_for_saas`
- `provider_hostname_id` unique, opaque
- `hostname_status`
- `ssl_status`
- `dns_status`
- `origin_status`
- `ownership_validation` encrypted/minimized JSON
- `certificate_validation` encrypted/minimized JSON
- `last_provider_error_code`
- `last_checked_at`
- `next_check_at`
- `attempt_count`
- `version`, timestamps

Secrets and the Cloudflare API token are never stored in this table. Validation payloads are exposed only through a safe DNS-instruction projection.

### `saas.store_domain_operations`

- immutable operation ID and fingerprint
- store/domain scope
- operation kind (`create`, `recheck`, `make_primary`, `disable`, `remove`)
- outcome and redacted provider error
- actor principal/membership IDs
- timestamps

All mutations run through security-definer PostgreSQL functions that re-evaluate tenant membership, permission, plan version, feature flag, and limit.

## Application boundaries

- `packages/saas-contracts`: public domain-view and mutation contracts, enums, validation limits.
- `packages/saas-data`: PostgreSQL repositories and exact projections.
- `packages/saas-domain-core`: provider-neutral orchestration plus a narrow Cloudflare for SaaS adapter.
- `apps/customer-panel`: authenticated domain routes, Settings page, and reconciliation trigger endpoint.
- deployment runtime: background reconciliation command/worker and Cloudflare Tunnel configuration.

The Cloudflare adapter receives only validated hostnames and exposes create/get/delete operations. It maps provider responses to internal states without leaking arbitrary Cloudflare payloads into the UI or database.

## Settings experience

Add `Alan Adı` under `Ayarlar`. The page uses the existing open, non-card-heavy admin language:

- top row: permanent Celebix address and its active state;
- one hostname input and `Alan adını bağla` action;
- a single DNS record row with copy actions;
- a compact four-step progress rail;
- exact status and one corrective action;
- active hostname actions: `Birincil yap`, `Yeniden kontrol et`, `Kaldır`.

There are no generic explanations, fake health indicators, or hard-coded completion states. Advanced provider details remain hidden unless an error requires them.

## Security and reliability

- Cloudflare token is server-only, least-privilege, and supplied through deployment secrets.
- Hostnames are ASCII-normalized and checked against the Public Suffix List before persistence.
- Provider API calls have bounded timeouts, retry classification, and redacted logs.
- Create and delete use operation fingerprints and provider lookup recovery.
- Read APIs expose no validation secret beyond the DNS record the merchant must publish.
- State changes require `configuration.manage` and active tenant/plan authority.
- Provider `active` alone is insufficient; both SSL state and exact-host health must pass.
- Unknown and pending hostnames fail closed at the storefront resolver.
- Tunnel has multiple replicas and no public-origin dependency for normal storefront traffic.
- Metrics cover pending age, provider errors, certificate age, reconciliation lag, and tunnel health.

## Plan policy

The current free-starter plan has custom domains disabled and a limit of zero, while the pilot plan enables one. Implementation preserves this authority. Product policy may later enable one domain for the free-starter plan by publishing a new immutable plan version; code must not bypass the plan contract.

## Rollout

1. Configure a staging Cloudflare for SaaS zone, fallback origin, CNAME target, and redundant tunnel replicas.
2. Apply additive database migration and assertions.
3. Deploy provider adapter and reconciliation in disabled mode.
4. Enable the Settings page for the pilot plan.
5. Connect a test hostname owned by Celebix and verify DNS, SSL, routing, login, cart, checkout, customer account, SEO canonicalization, and removal.
6. Enable Güzide Kuyumcu's entitlement and repeat the complete lifecycle.
7. Promote the same infrastructure contract to production and enable by plan version.

## Acceptance criteria

- A permitted merchant can connect one unique custom storefront hostname without sharing provider credentials.
- DNS instructions are correct for the entered hostname and configured Celebix target.
- The hostname is not served or made primary before all readiness checks pass.
- HTTPS, storefront content, customer login, cart, checkout, and account links work on the custom domain.
- The platform subdomain continues to work throughout the lifecycle.
- Removing a primary custom domain safely restores the platform hostname.
- A domain cannot cross tenant boundaries or be claimed twice.
- Provider outage and duplicate/replayed operations converge without corrupting local state.
- No per-domain Coolify deployment or proxy mutation is required.
