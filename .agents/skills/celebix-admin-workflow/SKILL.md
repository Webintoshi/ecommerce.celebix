---
name: celebix-admin-workflow
description: Use when changing the shared Celebix admin panel in apps/admin. Triggers on requests for new admin features, order management, product management, customer tools, marketplace, accounting, payments, settings, or admin auth changes that should affect all stores.
---

# Celebix Admin Workflow

Use this skill for shared admin work.

## Scope

Primary target:

- `apps/admin`

This is the shared admin codebase used by stores with different env values and different Supabase projects.

## Core rules

- Build once, affect many stores
- Do not hardcode store names, domains, or branding
- Store admins are assigned from owner panel, not self-service inside admin
- Auth must remain server-side Supabase session based

## Required checks before editing

Read these first when relevant:

- `apps/admin/lib/store-runtime.ts`
- `apps/admin/lib/admin-auth.ts`
- `apps/admin/middleware.ts`
- `stores/<slug>/store.config.json` if the issue is store-specific

## Do not reintroduce

- localStorage-based admin auth
- self-service first-admin setup from the admin login screen
- hardcoded `Ezmeo` or other store branding
- store-specific domains in shared admin UI

## Typical safe change areas

- Admin UI and routes in `apps/admin/app/admin`
- Admin API routes in `apps/admin/app/api`
- Store-safe runtime helpers in `apps/admin/lib`
- Shared admin components in `apps/admin/components/admin`

## Validation

After changes, run:

- `npm run build --workspace @celebix/admin`

If the change touches auth, role handling, or critical admin API routes, also smoke test:

- `/admin/login`
- products
- orders
- settings

