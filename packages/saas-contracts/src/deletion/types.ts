export const PERMANENT_DELETION_RESOURCE_KINDS = Object.freeze([
  "order",
  "product",
  "category",
] as const);

export const PERMANENT_DELETION_DISPOSITIONS = Object.freeze([
  "delete",
  "detach",
  "retain_snapshot",
  "external_unchanged",
] as const);

export const PERMANENT_DELETION_EFFECT_KINDS = Object.freeze({
  order: Object.freeze([
    "order_items",
    "notes",
    "notifications",
    "shipping_records",
    "draft_links",
    "cart_links",
    "external_payment",
    "external_fulfillment",
  ] as const),
  product: Object.freeze([
    "variants",
    "media",
    "catalog_relations",
    "pricing_records",
    "barcode_records",
    "order_line_snapshots",
  ] as const),
  category: Object.freeze([
    "product_links",
    "child_categories",
    "design_references",
  ] as const),
} as const);

export type PermanentDeletionResourceKind = (typeof PERMANENT_DELETION_RESOURCE_KINDS)[number];
export type PermanentDeletionDisposition = (typeof PERMANENT_DELETION_DISPOSITIONS)[number];
export type PermanentDeletionEffectKind =
  (typeof PERMANENT_DELETION_EFFECT_KINDS)[PermanentDeletionResourceKind][number];

export type PermanentDeletionEffect = Readonly<{
  kind: PermanentDeletionEffectKind;
  count: number;
  disposition: PermanentDeletionDisposition;
}>;

export type PermanentDeletionImpact = Readonly<{
  resourceKind: PermanentDeletionResourceKind;
  resourceId: string;
  expectedVersion: number;
  confirmationLabel: string;
  effects: readonly PermanentDeletionEffect[];
}>;

export type PermanentDeletionCommand = Readonly<{
  operationId: string;
  expectedVersion: number;
  confirmation: string;
}>;

export type PermanentDeletionResult = Readonly<{
  resourceKind: PermanentDeletionResourceKind;
  resourceId: string;
  deleted: true;
  auditId: string;
  replayed: boolean;
}>;
