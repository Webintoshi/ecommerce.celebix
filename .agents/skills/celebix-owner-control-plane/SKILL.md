---
name: celebix-owner-control-plane
description: Use when changing the Celebix owner panel or control plane in apps/owner. Triggers on requests for project listing, metrics, store creation, affiliate management, store admin assignment, provisioning, central auth, or any owner dashboard workflow.
---

# Celebix Owner Control Plane

Use this skill for central owner work.

## Scope

Primary target:

- `apps/owner`

The owner app is the control plane for:

- store records
- affiliate users
- store admin assignment
- Supabase provisioning
- R2 provisioning
- storefront scaffold creation

## Core rules

- Owner panel is the only place that should assign store admins
- Store secrets must stay outside public storefront and shared admin UI
- Provisioning state must be recorded in store config and control-plane storage
- Super admin actions must remain protected

## Files to read first

- `apps/owner/lib/control-plane.ts`
- `apps/owner/lib/owner-auth.ts`
- `apps/owner/lib/store-secrets.ts`
- `apps/owner/lib/storefront-scaffold.ts`
- `packages/platform-config/src/index.ts`

## Typical operations

- Create new owner dashboard modules
- Add store lifecycle actions
- Add affiliate workflows
- Add metrics and health panels
- Improve provisioning and scaffold automation

## Guardrails

Do not move store-specific UI into owner unless it is truly central administration.

Do not put raw production secrets into tracked JSON or code files.

Use env files or secret tables for sensitive per-store credentials.

## Validation

After edits, run:

- `npm run build --workspace @celebix/owner`

If the task changes store creation or provisioning, also verify:

- store list
- store detail
- store admin assignment
- storefront scaffold route

