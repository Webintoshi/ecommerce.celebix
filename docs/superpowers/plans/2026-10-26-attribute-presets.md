# Attribute Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track completed checks below.

**Goal:** Ready, opt-in store attributes for Ezmeo and future stores, with selected variant values automatically supplying physical measurements.

**Architecture:** Existing tenant catalog resources carry enabled and measurementField metadata. A private insert trigger seeds new stores; existing versioned APIs edit/activate real records. Variant composition derives measurements from selected resource bindings.

**Tech Stack:** TypeScript, React/Next.js, PostgreSQL16 native migrations.

**Spec:** docs/superpowers/specs/2026-10-26-attribute-presets-design.md

## Global Constraints

- Backfill only Ezmeo UUID7892a771-67a9-42d7-9b36-f4c3e8562e95; all future stores receive starters.
- Existing resource and product data is never overwritten; legacy omitted enabled stays enabled.
- Existing operation keys, server authority, versions and real Save effects remain.
- No changes to shipping desi, sessions, payments or historical tariff snapshots.
- Shared NET→SITE rollout is part of the authorized implementation.

## Review Focus

- An already-present or archived attribute must not be duplicated by seeding.
- Disabling a resource must not remove existing product variant data.
- Editing a closed starter must not enable it silently.
- Generic inherited weight must not overwrite a selected variant's 250 g.
- Retry, equivalent units and concurrent saves must preserve tenant isolation and clear recovery.

### Task1: Native starter initialization

Files: new native278 up/down/assertions/manifest and focused native tests.
Produces tenant resources with enabled:false, starterTemplate and optional measurementField.

- [x] Write and observe failing coverage for future/Ezmeo-only seed, collisions and retry.
- [x] Implement private helper/AFTER INSERT trigger and explicit Ezmeo backfill.
- [x] Rehearse catalog delta and exact rollback on socket-only PG16.

### Task2: Attribute activation and value editing

Files: CatalogResourceConsole.tsx, CatalogResourceEditor.tsx, focused behavior tests.
Consumes existing resources/saveResource API and typed value identity helper.

- [x] Test closed card enable, canManage gate, save errors, state preservation and numeric value duplicates.
- [x] Add accessible activation and preserve editable values/state/metadata.
- [x] Run focused resource behavior tests and panel typecheck.

### Task3: Variant measurement composition

Files: attribute-measurements.ts and tests, attribute-variants.ts, attribute-resource.ts,
AttributeVariantPicker.tsx, ProductAdvancedEditor.tsx and direct tests.
Produces strict value parser, equivalent identity and attributeMeasurementDraft.

- [x] Test selected weight/volume/dimensions/count, equivalent units, invalid text and disabled choices.
- [x] Map selected fields after shared defaults while preserving unrelated fields and existing drafts.
- [x] Verify create and add-variant paths with focused behavior tests.

### Task4: Verify and publish

- [x] Fresh independent code review and address concrete findings.
- [ ] Build panel and affected readers, run signup current/historical rehearsal and exact source check.
- [ ] Freeze baseline witnesses for all six apps and native277 before compatible native278 application.
- [ ] Publish reviewed panel candidate NET→SITE; verify running sources, acceptance and preserved authorities.
- [ ] Report user-facing result and any actual remaining limitation.
