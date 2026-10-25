# Store attribute starters and variant measurements

## Intent and approved scope

The user selected the hybrid model: provide useful attribute names and starter
values, let each merchant enable the ones they need, remove unwanted values and
add their own. Populate Ezmeo and stores created after this rollout only. Do not
backfill other existing stores or overwrite Ezmeo's existing attributes.

Selecting a physical attribute value for a variant must also fill its physical
measurement. Selecting `250 g` must not require a second weight entry. Product
weight remains separate from shipping desi, packaging and freight settings.

## Approach

Reuse real tenant-scoped catalog resources and their existing versioned save
API. An optional `config.enabled=false` keeps a starter visible in Nitelikler
but out of product pickers. Omission retains legacy enabled behavior. A separate
template/adoption subsystem would duplicate existing editing and mutation flows;
archived resources cannot represent reversible activation.

Private seed helper and an AFTER INSERT store trigger create starter resources
inside normal store creation. One explicit migration backfill targets Ezmeo.
Idempotent collision checks include archived resources; never reseed reads or
overwrite a merchant's values. No signup/session function is replaced.

The initial shared catalog is Renk, Beden, Malzeme, Desen, Kalıp, Cinsiyet, Yaş
grubu, Ağırlık, Hacim, Uzunluk, En, Yükseklik, Paket içi adet, Ürün durumu.
Marka already has its own resource module. Stable measurementField metadata
binds only weight, volume, length, width, height and packageCount; names alone
never infer a binding. Positive numeric values use existing supported units and
precision. Equivalent measurements such as 1 kg and 1000 g cannot be added twice.

## UX and invariants

Current inventory: resource search, value chips, create/edit/archive, inline
value addition, variant combinations and version conflicts. Preserve these.
Primary task: enable a ready attribute and immediately reuse selected values.
Use the existing compact resource cards, clear Etkin/Kapalı state and accessible
enable control. Editing a closed starter preserves its state; explicit enable
changes it. Save remains a single real mutation. No payment/purchase lock.

Mapping happens when composing variant rows, after shared measurement
inheritance. Selected physical attributes take precedence for their own fields;
unrelated explicit measurements, prices, stock and shipping settings survive.
No existing products, variants, orders or historic tariff snapshots are rewritten.

## Verification and rollout

Focused tests cover tenant seeding boundaries, collisions/idempotency, activation,
editable values, disabled picker choices, equivalent units, physical mapping and
inheritance. Rehearse native278 on socket-only PostgreSQL16 including exact down.
Run panel typecheck/build, signup current/historical rehearsal and source guard.
Review the complete change before live apply. Apply compatible data first, then
publish the same reviewed panel candidate NET then SITE and verify live sources.
Owner and storefront runtimes/payment authorities remain protected witnesses.
