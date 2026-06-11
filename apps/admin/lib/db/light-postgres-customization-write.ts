import "server-only";

import type { CustomizationSchema, CustomizationStep } from "@/types/product-customization";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { queryAdminLightPostgresOne, withAdminLightPostgresTransaction } from "@/lib/db/light-postgres-client";
import { maybeEnsureAdminCustomizationSchema } from "@/lib/db/light-postgres-customization-schema";
import { maybeGetAdminCustomizationSchemaById } from "@/lib/db/light-postgres-read";

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

type LightPostgresSchemaWriteRow = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  sort_order: number;
  settings: unknown;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export interface LightPostgresCreateCustomizationSchemaInput {
  name: string;
  description?: string;
  slug: string;
  settings?: Record<string, unknown>;
}

export interface LightPostgresSaveCustomizationSchemaInput {
  schema: {
    id: string;
    name: string;
    description?: string;
    is_active?: boolean;
    settings?: Record<string, unknown>;
  };
  steps: CustomizationStep[];
  productAssignments?: string[];
  categoryAssignments?: string[];
}

function isPersistedId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("temp-");
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeJsonValue(value: unknown): JsonValue | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>).flatMap(
      ([key, entry]) => {
        const normalized = normalizeJsonValue(entry);
        return normalized === undefined ? [] : [[key, normalized] as const];
      },
    );

    return Object.fromEntries(normalizedEntries);
  }

  return null;
}

function toJsonParam(value: unknown, fallback: JsonValue): string {
  return JSON.stringify(normalizeJsonValue(value) ?? fallback);
}

function mapSchemaRow(row: LightPostgresSchemaWriteRow): CustomizationSchema {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    slug: row.slug,
    is_active: normalizeBoolean(row.is_active),
    sort_order: normalizeNumber(row.sort_order),
    settings: (normalizeJsonValue(row.settings) ?? {}) as CustomizationSchema["settings"],
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    created_by: row.created_by ?? undefined,
  };
}

function uniqueStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  ];
}

export async function maybeCreateLightPostgresCustomizationSchema(
  input: LightPostgresCreateCustomizationSchemaInput,
) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await maybeEnsureAdminCustomizationSchema();

  const row = await queryAdminLightPostgresOne<LightPostgresSchemaWriteRow>(
    `
      insert into public.product_customization_schemas (name, description, slug, settings, is_active)
      values ($1, $2, $3, $4, true)
      returning id, name, description, slug, is_active, sort_order, settings, created_at, updated_at, created_by
    `,
    [
      input.name,
      normalizeString(input.description),
      input.slug,
      toJsonParam(input.settings, {}),
    ],
  );

  return row ? mapSchemaRow(row) : null;
}

export async function maybeDuplicateLightPostgresCustomizationSchema(schemaId: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await maybeEnsureAdminCustomizationSchema();
  const sourceSchema = await maybeGetAdminCustomizationSchemaById(schemaId);
  if (!sourceSchema) {
    return null;
  }

  return withAdminLightPostgresTransaction(async (client) => {
    const schemaResult = await client.query<LightPostgresSchemaWriteRow>(
      `
        insert into public.product_customization_schemas (
          name,
          description,
          slug,
          settings,
          is_active,
          sort_order
        )
        values ($1, $2, $3, $4, false, $5)
        returning id, name, description, slug, is_active, sort_order, settings, created_at, updated_at, created_by
      `,
      [
        `${sourceSchema.name} (Kopya)`,
        sourceSchema.description ?? null,
        `${sourceSchema.slug}-kopya-${Date.now()}`,
        toJsonParam(sourceSchema.settings, {}),
        normalizeNumber(sourceSchema.sort_order),
      ],
    );
    const newSchema = schemaResult.rows[0];

    for (const step of sourceSchema.steps || []) {
      const stepResult = await client.query<{ id: string }>(
        `
          insert into public.product_customization_steps (
            schema_id,
            type,
            key,
            label,
            placeholder,
            help_text,
            is_required,
            validation_rules,
            grid_width,
            style_config,
            show_conditions,
            price_config,
            default_value,
            sort_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          returning id
        `,
        [
          newSchema.id,
          step.type,
          step.key,
          step.label,
          step.placeholder ?? null,
          step.help_text ?? null,
          normalizeBoolean(step.is_required),
          toJsonParam(step.validation_rules, {}),
          step.grid_width ?? "full",
          toJsonParam(step.style_config, {}),
          step.show_conditions ? toJsonParam(step.show_conditions, null) : null,
          step.price_config ? toJsonParam(step.price_config, null) : null,
          step.default_value === undefined ? null : toJsonParam(step.default_value, null),
          normalizeNumber(step.sort_order),
        ],
      );
      const newStepId = stepResult.rows[0]?.id;
      if (!newStepId) {
        throw new Error("Kopyalanan adim olusturulamadi.");
      }

      for (const option of step.options || []) {
        await client.query(
          `
            insert into public.product_customization_options (
              step_id,
              label,
              value,
              description,
              image_url,
              icon,
              color,
              price_adjustment,
              price_adjustment_type,
              stock_quantity,
              track_stock,
              show_conditions,
              sort_order,
              is_default,
              is_disabled,
              dependent_step_ids
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `,
          [
            newStepId,
            option.label,
            option.value,
            option.description ?? null,
            option.image_url ?? null,
            option.icon ?? null,
            option.color ?? null,
            normalizeNumber(option.price_adjustment),
            option.price_adjustment_type ?? "fixed",
            option.stock_quantity ?? null,
            normalizeBoolean(option.track_stock),
            option.show_conditions ? toJsonParam(option.show_conditions, null) : null,
            normalizeNumber(option.sort_order),
            normalizeBoolean(option.is_default),
            normalizeBoolean(option.is_disabled),
            toJsonParam(option.dependent_step_ids ?? [], []),
          ],
        );
      }
    }

    return mapSchemaRow(newSchema);
  });
}

export async function maybeSaveLightPostgresCustomizationSchema(
  input: LightPostgresSaveCustomizationSchemaInput,
) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await maybeEnsureAdminCustomizationSchema();

  return withAdminLightPostgresTransaction(async (client) => {
    await client.query(
      `
        update public.product_customization_schemas
        set
          name = $2,
          description = $3,
          is_active = coalesce($4, is_active),
          settings = $5
        where id::text = $1
      `,
      [
        input.schema.id,
        input.schema.name,
        normalizeString(input.schema.description),
        typeof input.schema.is_active === "boolean" ? input.schema.is_active : null,
        toJsonParam(input.schema.settings, {}),
      ],
    );

    const existingStepResult = await client.query<{ id: string }>(
      `
        select id
        from public.product_customization_steps
        where schema_id::text = $1
      `,
      [input.schema.id],
    );
    const existingStepIds = new Set(existingStepResult.rows.map((row) => row.id));
    const currentStepIds = new Set(input.steps.filter((step) => isPersistedId(step.id)).map((step) => step.id));
    const stepIdsToDelete = [...existingStepIds].filter((id) => !currentStepIds.has(id));

    if (stepIdsToDelete.length > 0) {
      await client.query(
        `
          delete from public.product_customization_steps
          where id::text = any($1::text[])
        `,
        [stepIdsToDelete],
      );
    }

    for (const [stepIndex, step] of input.steps.entries()) {
      const stepParams = [
        input.schema.id,
        step.type,
        step.key,
        step.label,
        step.placeholder ?? null,
        step.help_text ?? null,
        normalizeBoolean(step.is_required),
        toJsonParam(step.validation_rules, {}),
        step.grid_width ?? "full",
        toJsonParam(step.style_config, {}),
        step.show_conditions ? toJsonParam(step.show_conditions, null) : null,
        step.price_config ? toJsonParam(step.price_config, null) : null,
        step.default_value === undefined ? null : toJsonParam(step.default_value, null),
        normalizeNumber(step.sort_order, stepIndex),
      ];

      let stepId = step.id;
      if (isPersistedId(step.id)) {
        await client.query(
          `
            update public.product_customization_steps
            set
              schema_id = $1,
              type = $2,
              key = $3,
              label = $4,
              placeholder = $5,
              help_text = $6,
              is_required = $7,
              validation_rules = $8,
              grid_width = $9,
              style_config = $10,
              show_conditions = $11,
              price_config = $12,
              default_value = $13,
              sort_order = $14
            where id::text = $15
          `,
          [...stepParams, step.id],
        );
      } else {
        const insertedStep = await client.query<{ id: string }>(
          `
            insert into public.product_customization_steps (
              schema_id,
              type,
              key,
              label,
              placeholder,
              help_text,
              is_required,
              validation_rules,
              grid_width,
              style_config,
              show_conditions,
              price_config,
              default_value,
              sort_order
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            returning id
          `,
          stepParams,
        );
        stepId = insertedStep.rows[0]?.id;
      }

      if (!isPersistedId(stepId)) {
        throw new Error("Sema adimi kaydedilemedi.");
      }

      const existingOptionResult = await client.query<{ id: string }>(
        `
          select id
          from public.product_customization_options
          where step_id::text = $1
        `,
        [stepId],
      );
      const existingOptionIds = new Set(existingOptionResult.rows.map((row) => row.id));
      const currentOptionIds = new Set(
        (step.options || []).filter((option) => isPersistedId(option.id)).map((option) => option.id),
      );
      const optionIdsToDelete = [...existingOptionIds].filter((id) => !currentOptionIds.has(id));

      if (optionIdsToDelete.length > 0) {
        await client.query(
          `
            delete from public.product_customization_options
            where id::text = any($1::text[])
          `,
          [optionIdsToDelete],
        );
      }

      for (const [optionIndex, option] of (step.options || []).entries()) {
        const optionParams = [
          stepId,
          option.label,
          option.value,
          option.description ?? null,
          option.image_url ?? null,
          option.icon ?? null,
          option.color ?? null,
          normalizeNumber(option.price_adjustment),
          option.price_adjustment_type ?? "fixed",
          option.stock_quantity ?? null,
          normalizeBoolean(option.track_stock),
          option.show_conditions ? toJsonParam(option.show_conditions, null) : null,
          normalizeNumber(option.sort_order, optionIndex),
          normalizeBoolean(option.is_default),
          normalizeBoolean(option.is_disabled),
          toJsonParam(option.dependent_step_ids ?? [], []),
        ];

        if (isPersistedId(option.id)) {
          await client.query(
            `
              update public.product_customization_options
              set
                step_id = $1,
                label = $2,
                value = $3,
                description = $4,
                image_url = $5,
                icon = $6,
                color = $7,
                price_adjustment = $8,
                price_adjustment_type = $9,
                stock_quantity = $10,
                track_stock = $11,
                show_conditions = $12,
                sort_order = $13,
                is_default = $14,
                is_disabled = $15,
                dependent_step_ids = $16
              where id::text = $17
            `,
            [...optionParams, option.id],
          );
        } else {
          await client.query(
            `
              insert into public.product_customization_options (
                step_id,
                label,
                value,
                description,
                image_url,
                icon,
                color,
                price_adjustment,
                price_adjustment_type,
                stock_quantity,
                track_stock,
                show_conditions,
                sort_order,
                is_default,
                is_disabled,
                dependent_step_ids
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `,
            optionParams,
          );
        }
      }
    }

    const desiredProductIds = uniqueStringList(input.productAssignments);
    const desiredCategoryIds = uniqueStringList(input.categoryAssignments);

    const existingProductAssignmentResult = await client.query<{ id: string; product_id: string }>(
      `
        select id, product_id
        from public.product_schema_assignments
        where schema_id::text = $1
      `,
      [input.schema.id],
    );
    const existingProductMap = new Map(
      existingProductAssignmentResult.rows.map((assignment) => [assignment.product_id, assignment.id]),
    );
    const productIdsToDelete = [...existingProductMap.keys()].filter(
      (productId) => !desiredProductIds.includes(productId),
    );

    if (productIdsToDelete.length > 0) {
      await client.query(
        `
          delete from public.product_schema_assignments
          where schema_id::text = $1
            and product_id::text = any($2::text[])
        `,
        [input.schema.id, productIdsToDelete],
      );
    }

    for (const [index, productId] of desiredProductIds.entries()) {
      const existingAssignmentId = existingProductMap.get(productId);
      if (existingAssignmentId) {
        await client.query(
          `
            update public.product_schema_assignments
            set sort_order = $2
            where id::text = $1
          `,
          [existingAssignmentId, index],
        );
        continue;
      }

      const otherAssignments = await client.query<{ count: string }>(
        `
          select count(*)::text as count
          from public.product_schema_assignments
          where product_id::text = $1
        `,
        [productId],
      );
      const isDefault = normalizeNumber(otherAssignments.rows[0]?.count) === 0;

      await client.query(
        `
          insert into public.product_schema_assignments (schema_id, product_id, is_default, sort_order)
          values ($1, $2, $3, $4)
          on conflict (schema_id, product_id) do update
          set sort_order = excluded.sort_order
        `,
        [input.schema.id, productId, isDefault, index],
      );
    }

    const existingCategoryAssignmentResult = await client.query<{ id: string; category_id: string }>(
      `
        select id, category_id
        from public.category_schema_assignments
        where schema_id::text = $1
      `,
      [input.schema.id],
    );
    const existingCategoryMap = new Map(
      existingCategoryAssignmentResult.rows.map((assignment) => [assignment.category_id, assignment.id]),
    );
    const categoryIdsToDelete = [...existingCategoryMap.keys()].filter(
      (categoryId) => !desiredCategoryIds.includes(categoryId),
    );

    if (categoryIdsToDelete.length > 0) {
      await client.query(
        `
          delete from public.category_schema_assignments
          where schema_id::text = $1
            and category_id::text = any($2::text[])
        `,
        [input.schema.id, categoryIdsToDelete],
      );
    }

    for (const categoryId of desiredCategoryIds) {
      if (existingCategoryMap.has(categoryId)) {
        continue;
      }

      await client.query(
        `
          insert into public.category_schema_assignments (schema_id, category_id, is_auto_apply)
          values ($1, $2, false)
          on conflict (schema_id, category_id) do nothing
        `,
        [input.schema.id, categoryId],
      );
    }

    return true;
  });
}

export async function maybeSetLightPostgresCustomizationSchemaActive(id: string, isActive: boolean) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await maybeEnsureAdminCustomizationSchema();
  const row = await queryAdminLightPostgresOne(
    `
      update public.product_customization_schemas
      set is_active = $2
      where id::text = $1
      returning id
    `,
    [id, isActive],
  );

  return Boolean(row);
}

export async function maybeDeleteLightPostgresCustomizationSchema(id: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await maybeEnsureAdminCustomizationSchema();
  const row = await queryAdminLightPostgresOne(
    `
      delete from public.product_customization_schemas
      where id::text = $1
      returning id
    `,
    [id],
  );

  return Boolean(row);
}
