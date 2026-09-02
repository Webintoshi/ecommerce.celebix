# Automatic Admin Domain Bundles — Design

## Scope

`apps/customer-panel` accepts one custom storefront hostname and provisions a managed `admin.<registrable-domain>` companion. The existing native Cloudflare for SaaS custom-hostname path remains the routing authority; no Worker is introduced. `apps/admin/**` is out of scope.

## Domain authority

- The server normalizes a bare hostname or an exact root `https://` URL with `tldts`/ICANN data.
- The submitted storefront hostname is retained; the admin companion is always `admin.<registrable-domain>`.
- IPs, localhost, public suffixes, reserved Celebix suffixes, URL credentials/ports/path/query/hash, and storefront inputs already beginning with `admin.` fail closed.
- Storefront and admin remain distinct tables and projections; this encodes `purpose`. Admin rows gain `management` and `source_storefront_domain_id`.
- A partial unique index permits at most one system-managed admin companion per storefront domain.

## Atomic intent and external saga

An additive PostgreSQL function prepares both local intents under one store lock. It either inserts a new managed admin row, adopts an unlinked same-store exact admin row without changing its provider/TLS/DNS snapshot, or rejects a cross-store/cross-purpose collision. A durable operation record makes retries return the same pair.

Cloudflare calls happen only after the database transaction commits. The storefront and admin custom hostnames are independently created/recovered and independently bound. Storefront and admin use separate configuration-driven CNAME targets. A partial admin provider failure leaves the storefront intent intact and the platform admin fallback authoritative.

## Lifecycle

Storefront primary and disable operations become bundle-aware. A ready companion follows a storefront primary change; an unready companion does not replace the current primary admin. Disabling a custom storefront also disables its managed companion and restores both platform fallbacks when required. Platform fallback rows cannot be removed.

The merchant admin-domain collection endpoint becomes read-only. Recheck remains available for a failed/pending managed companion. Direct arbitrary admin hostname creation, primary selection, and disable are rejected so only storefront-owned bundle lifecycle can change a managed companion.

## Existing records and backfill

Migration 121 adopts exact same-store pairs only when unambiguous, preserving provider IDs and all readiness state. A dry-run-first owner script reports store, storefront, derived admin hostname, existing row, provider state, conflict, and intended action. Apply mode calls owner-only audited SQL functions, refuses cross-tenant conflicts, and resumes an unbound create/adopt/replay intent idempotently.

## UI and auth

The settings page loads storefront and admin projections together and renders custom storefront bundles. A single form shows the derived admin preview. Raw provider states are translated to Turkish. Active DNS details are collapsed; pending/failed details are open. Platform storefront/admin fallbacks appear in one compact technical recovery section.

The existing central Logto callback and signed return-host handoff are unchanged. Only active admin-domain rows are return-host authorities; storefront hostnames never become Customer Panel authorities.

## Rollout

Merge commit only. Before staging migration: take a database backup and prove that it can be inspected/restored in a disposable target. Apply additive migration 121 first, run assertions and dry-run/apply adoption, then deploy the exact merge SHA. Rollback is code-first; paired rows and platform fallbacks remain in place. Down migration is emergency/disposable only.
