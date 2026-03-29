---
name: celebix-store-provisioning
description: Use when creating or wiring a new store in Celebix. Triggers on requests to open a new project, provision Supabase or R2, generate a storefront app, connect a domain, or prepare per-store env and config files.
---

# Celebix Store Provisioning

Use this skill when a new store must be created or connected.

## The store model

Each store should have:

- one store config at `stores/<slug>/store.config.json`
- one store admin env file
- one store storefront app at `apps/storefront-<slug>`
- one separate Supabase project
- one separate R2 bucket

Shared code remains in:

- `apps/admin`
- `apps/owner`

## Standard flow

1. Create or confirm `stores/<slug>/store.config.json`
2. Provision or connect the store Supabase project
3. Provision or connect the store R2 bucket
4. Generate the store storefront from `apps/storefront-base`
5. Write per-store env files
6. Update owner/storefront metadata
7. Build owner and the new storefront

## Source of truth

- `packages/platform-config/src/index.ts`
- `apps/owner/lib/storefront-scaffold.ts`
- `stores/<slug>/store.config.json`

## Guardrails

- one Supabase project per store
- one R2 bucket per store
- no store should reuse another store's env, DB, or asset bucket
- do not create duplicate Supabase projects for the same store unless the user explicitly asks

## Validation

After provisioning, confirm:

- store config has correct storefront and admin metadata
- storefront app exists
- store env files point to the right Supabase and R2 values
- `npm run build --workspace @celebix/owner`
- `npm run build --workspace @celebix/storefront-<slug>`

