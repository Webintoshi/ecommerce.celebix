# Attribute starters and physical variant values

## Scope

Shared panel code supports optional `config.enabled` on attribute resources;
omission remains enabled for every legacy resource. Native278 installs an owner
private store-insert trigger and seeds fourteen inactive starter attributes for
future stores. Its sole existing-tenant backfill is Ezmeo. No existing product,
variant, order, session, commercial plan or shipping calculation is rewritten.

Ezmeo already has an active Ağırlık resource with `500g`, `1000g`, `250g` values.
The migration preserves these exact strings and its enabled state, adds only
`measurementField: weight`, and increments its version. Thirteen other starters
are inserted closed. Existing names, slugs, native keys and archived resources
win collision checks. Reads never reseed a merchant's edited values.

## Editing and measurement behavior

The normal real, versioned catalog save enables/disables each attribute. Values
remain editable while closed. Failed activation retains the old card and offers
a list refresh; synchronous duplicate clicks issue one command. Server-side
catalog management authority and version conflicts remain in force.

Only an explicitly typed resource binds a selected variant value to a physical
measurement. Supported bindings are weight(g/kg), volume(ml/l),
length/width/height(cm/m), and positive integer packageCount. Decimal comma and
up to three decimal places use the existing exact milli measurement contract.
Equivalent units deduplicate; unknown or ambiguous values do not invent facts.

The product picker supplies physical values for new rows. Advanced creation
merges inherited measurements first, then the selected variant fields. Existing
row edits and unrelated measurements survive. The existing-product add-variant
flow persists the same values. Shipping desi, price, stock, SKU and freight
settings retain their independent behavior.

## Verification and release procedure

Focused DOM/contract tests exercise list activation, read-only authority,
failures, value deletion/addition, closed-state preservation, equivalent units,
disabled options, actual create/detail composition and persisted payloads.
The native functional suite checks future insertion, tenant scope, collisions,
idempotency, rollback of failed signup, metadata cleanup, private grants,
versioned merchant mutation/replay and guarded down.

A separate socket-only PostgreSQL16 rehearsal overlays the freshly captured
2060-routine native277 catalogue, applies278 and verifies only two private
routine additions, unchanged predecessor definitions/grants and exact rollback.
Current-default and historical tariff signup rehearsals bind the forward SQL
to the generated source proof. The exact reviewed candidate must pass the
signup build guard and official panel build before publication.

Root applies the reviewed data support with a private server backup, before/after
tenant and application witnesses and no automatic retry of uncertain outcomes.
Publish panel NET then SITE with finished-runtime acceptance between them.
All four owner/storefront runtimes and every compiled payment authority remain
protected. Live completion requires verified running candidate sources.

The browser control connection was unavailable during local verification;
automated DOM composition and real saved-payload checks cover the UI behavior.
Do not describe this as a completed authenticated visual acceptance check.
