---
name: celebix-shared-contracts
description: Use when a change touches shared data contracts between admin, storefront, and owner. Triggers on schema changes, API response shape changes, store runtime config changes, cross-app env changes, or any change that could break compatibility across multiple stores.
---

# Celebix Shared Contracts

Use this skill whenever a change can ripple across apps.

## Shared surfaces

- Supabase schema and migrations
- `packages/platform-config`
- per-store env contract
- store runtime helpers
- admin/storefront data assumptions

## Before changing a shared contract

Identify which apps are affected:

- `apps/admin`
- `apps/owner`
- `apps/storefront-<slug>`
- `apps/storefront-base`

Then check whether the change is:

- store-specific
- shared feature work
- schema evolution
- provisioning-related

## Preferred decision rule

- Store-specific visual work: keep inside `apps/storefront-<slug>`
- Shared frontend pattern: consider `apps/storefront-base`
- Shared admin behavior: `apps/admin`
- Provisioning and control plane: `apps/owner` plus `packages/platform-config`

## High-risk changes

- changing env names
- changing admin auth behavior
- changing public API response fields
- changing product, category, order, or settings queries
- changing store config shape

## Validation

Build every affected app, not just the one you edited.

Minimum rule:

- if `packages/platform-config` changed, build owner and the affected storefront
- if schema or runtime contract changed, build admin and the affected storefront
