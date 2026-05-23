type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface LightPostgresCustomizationReadExecutor {
  <TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<TRow[]>;
}

export interface LightPostgresCustomizationOptionRecord {
  id: string;
  step_id: string;
  label: string;
  value: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  color: string | null;
  price_adjustment: number;
  price_adjustment_type: string;
  stock_quantity: number | null;
  track_stock: boolean;
  show_conditions: JsonValue | null;
  sort_order: number;
  is_default: boolean;
  is_disabled: boolean;
  dependent_step_ids: JsonValue | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LightPostgresCustomizationStepRecord {
  id: string;
  schema_id: string;
  type: string;
  key: string;
  label: string;
  placeholder: string | null;
  help_text: string | null;
  is_required: boolean;
  validation_rules: JsonValue | null;
  sort_order: number;
  grid_width: string;
  style_config: JsonValue | null;
  show_conditions: JsonValue | null;
  price_config: JsonValue | null;
  default_value: JsonValue | null;
  created_at: string | null;
  updated_at: string | null;
  options: LightPostgresCustomizationOptionRecord[];
}

export interface LightPostgresCustomizationSchemaRecord {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_active: boolean;
  sort_order: number;
  settings: JsonValue | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface LightPostgresCustomizationSchemaPayload
  extends LightPostgresCustomizationSchemaRecord {
  steps: LightPostgresCustomizationStepRecord[];
}

export interface LightPostgresProductSchemaAssignmentRecord extends Record<string, unknown> {
  id: string;
  schema_id: string;
  product_id: string;
  is_default: boolean;
  sort_order: number;
  created_at: string | null;
}

export interface LightPostgresCategorySchemaAssignmentRecord extends Record<string, unknown> {
  id: string;
  schema_id: string;
  category_id: string;
  is_auto_apply: boolean;
  created_at: string | null;
}

export interface LightPostgresCustomizationSchemaDetail
  extends LightPostgresCustomizationSchemaPayload {
  product_assignments: LightPostgresProductSchemaAssignmentRecord[];
  category_assignments: LightPostgresCategorySchemaAssignmentRecord[];
}

export interface LightPostgresCustomizationSchemaSummary
  extends LightPostgresCustomizationSchemaRecord {
  step_count: number;
  product_count: number;
  category_count: number;
}

type SchemaRow = Omit<LightPostgresCustomizationSchemaRecord, "settings"> & {
  settings: unknown;
};

type StepRow = Omit<
  LightPostgresCustomizationStepRecord,
  "validation_rules" | "style_config" | "show_conditions" | "price_config" | "default_value" | "options"
> & {
  validation_rules: unknown;
  style_config: unknown;
  show_conditions: unknown;
  price_config: unknown;
  default_value: unknown;
};

type OptionRow = Omit<
  LightPostgresCustomizationOptionRecord,
  "show_conditions" | "dependent_step_ids"
> & {
  show_conditions: unknown;
  dependent_step_ids: unknown;
};

type ProductAssignmentRow = LightPostgresProductSchemaAssignmentRecord;
type CategoryAssignmentRow = LightPostgresCategorySchemaAssignmentRecord;

type ProductCategoryRow = {
  id: string;
  category: string | null;
  subcategory: string | null;
};

type CategorySlugRow = {
  id: string;
  slug: string;
};

type SchemaActiveRow = {
  id: string;
  is_active: boolean;
};

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["true", "t", "1", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return false;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function mapSchemaRow(row: SchemaRow): LightPostgresCustomizationSchemaRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    is_active: normalizeBoolean(row.is_active),
    sort_order: normalizeNumber(row.sort_order),
    settings: normalizeJsonValue(row.settings),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
}

function mapStepRow(row: StepRow): LightPostgresCustomizationStepRecord {
  return {
    id: row.id,
    schema_id: row.schema_id,
    type: row.type,
    key: row.key,
    label: row.label,
    placeholder: row.placeholder,
    help_text: row.help_text,
    is_required: normalizeBoolean(row.is_required),
    validation_rules: normalizeJsonValue(row.validation_rules),
    sort_order: normalizeNumber(row.sort_order),
    grid_width: row.grid_width,
    style_config: normalizeJsonValue(row.style_config),
    show_conditions: normalizeJsonValue(row.show_conditions),
    price_config: normalizeJsonValue(row.price_config),
    default_value: normalizeJsonValue(row.default_value),
    created_at: row.created_at,
    updated_at: row.updated_at,
    options: [],
  };
}

function mapOptionRow(row: OptionRow): LightPostgresCustomizationOptionRecord {
  return {
    id: row.id,
    step_id: row.step_id,
    label: row.label,
    value: row.value,
    description: row.description,
    image_url: row.image_url,
    icon: row.icon,
    color: row.color,
    price_adjustment: normalizeNumber(row.price_adjustment),
    price_adjustment_type: row.price_adjustment_type,
    stock_quantity:
      row.stock_quantity === null || row.stock_quantity === undefined
        ? null
        : normalizeNumber(row.stock_quantity),
    track_stock: normalizeBoolean(row.track_stock),
    show_conditions: normalizeJsonValue(row.show_conditions),
    sort_order: normalizeNumber(row.sort_order),
    is_default: normalizeBoolean(row.is_default),
    is_disabled: normalizeBoolean(row.is_disabled),
    dependent_step_ids: normalizeJsonValue(row.dependent_step_ids),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadSchemaRecord(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
): Promise<LightPostgresCustomizationSchemaRecord | null> {
  const rows = await execute<SchemaRow>(
    `
      select
        id,
        name,
        description,
        slug,
        is_active,
        sort_order,
        settings,
        created_at,
        updated_at,
        created_by
      from public.product_customization_schemas
      where id::text = $1
      limit 1
    `,
    [schemaId],
  );

  return rows[0] ? mapSchemaRow(rows[0]) : null;
}

async function loadSchemaSteps(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
): Promise<LightPostgresCustomizationStepRecord[]> {
  const stepRows = await execute<StepRow>(
    `
      select
        id,
        schema_id,
        type,
        key,
        label,
        placeholder,
        help_text,
        is_required,
        validation_rules,
        sort_order,
        grid_width,
        style_config,
        show_conditions,
        price_config,
        default_value,
        created_at,
        updated_at
      from public.product_customization_steps
      where schema_id::text = $1
      order by sort_order asc, created_at asc
    `,
    [schemaId],
  );

  const steps = stepRows.map(mapStepRow);
  if (steps.length === 0) {
    return [];
  }

  const optionRows = await execute<OptionRow>(
    `
      select
        id,
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
        dependent_step_ids,
        created_at,
        updated_at
      from public.product_customization_options
      where step_id::text = any($1::text[])
      order by sort_order asc, created_at asc
    `,
    [steps.map((step) => step.id)],
  );

  const optionsByStepId = new Map<string, LightPostgresCustomizationOptionRecord[]>();
  for (const optionRow of optionRows) {
    const option = mapOptionRow(optionRow);
    const bucket = optionsByStepId.get(option.step_id) ?? [];
    bucket.push(option);
    optionsByStepId.set(option.step_id, bucket);
  }

  return steps.map((step) => ({
    ...step,
    options: optionsByStepId.get(step.id) ?? [],
  }));
}

async function loadProductAssignments(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
): Promise<LightPostgresProductSchemaAssignmentRecord[]> {
  return execute<ProductAssignmentRow>(
    `
      select
        id,
        schema_id,
        product_id,
        is_default,
        sort_order,
        created_at
      from public.product_schema_assignments
      where schema_id::text = $1
      order by is_default desc, sort_order asc, created_at asc
    `,
    [schemaId],
  );
}

async function loadCategoryAssignments(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
): Promise<LightPostgresCategorySchemaAssignmentRecord[]> {
  return execute<CategoryAssignmentRow>(
    `
      select
        id,
        schema_id,
        category_id,
        is_auto_apply,
        created_at
      from public.category_schema_assignments
      where schema_id::text = $1
      order by created_at asc
    `,
    [schemaId],
  );
}

export async function getLightPostgresCustomizationSchemaById(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
  options: { activeOnly?: boolean } = {},
): Promise<LightPostgresCustomizationSchemaPayload | null> {
  const schema = await loadSchemaRecord(execute, schemaId);
  if (!schema) {
    return null;
  }

  if (options.activeOnly !== false && !schema.is_active) {
    return null;
  }

  return {
    ...schema,
    steps: await loadSchemaSteps(execute, schemaId),
  };
}

export async function getLightPostgresCustomizationSchemaDetailById(
  execute: LightPostgresCustomizationReadExecutor,
  schemaId: string,
): Promise<LightPostgresCustomizationSchemaDetail | null> {
  const schema = await getLightPostgresCustomizationSchemaById(execute, schemaId, {
    activeOnly: false,
  });

  if (!schema) {
    return null;
  }

  const [productAssignments, categoryAssignments] = await Promise.all([
    loadProductAssignments(execute, schemaId),
    loadCategoryAssignments(execute, schemaId),
  ]);

  return {
    ...schema,
    product_assignments: productAssignments,
    category_assignments: categoryAssignments,
  };
}

export async function listLightPostgresCustomizationSchemas(
  execute: LightPostgresCustomizationReadExecutor,
): Promise<LightPostgresCustomizationSchemaSummary[]> {
  const rows = await execute<
    SchemaRow & {
      step_count: unknown;
      product_count: unknown;
      category_count: unknown;
    }
  >(
    `
      select
        s.id,
        s.name,
        s.description,
        s.slug,
        s.is_active,
        s.sort_order,
        s.settings,
        s.created_at,
        s.updated_at,
        s.created_by,
        (
          select count(*)::int
          from public.product_customization_steps st
          where st.schema_id = s.id
        ) as step_count,
        (
          select count(*)::int
          from public.product_schema_assignments pa
          where pa.schema_id = s.id
        ) as product_count,
        (
          select count(*)::int
          from public.category_schema_assignments ca
          where ca.schema_id = s.id
        ) as category_count
      from public.product_customization_schemas s
      order by s.sort_order asc nulls last, s.created_at desc nulls last
    `,
  );

  return rows.map((row) => ({
    ...mapSchemaRow(row),
    step_count: normalizeNumber(row.step_count),
    product_count: normalizeNumber(row.product_count),
    category_count: normalizeNumber(row.category_count),
  }));
}

export async function resolveLightPostgresAssignedCustomizationSchemaId(
  execute: LightPostgresCustomizationReadExecutor,
  productId: string,
): Promise<string | null> {
  const productAssignmentRows = await execute<
    Pick<ProductAssignmentRow, "schema_id" | "is_default" | "sort_order" | "created_at">
  >(
    `
      select
        schema_id,
        is_default,
        sort_order,
        created_at
      from public.product_schema_assignments
      where product_id::text = $1
      order by is_default desc, sort_order asc, created_at asc
    `,
    [productId],
  );

  const productRows = await execute<ProductCategoryRow>(
    `
      select id, category, subcategory
      from public.products
      where id::text = $1
      limit 1
    `,
    [productId],
  );

  const product = productRows[0] ?? null;
  const categorySlugs = [product?.subcategory, product?.category]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  let categoryRows: CategorySlugRow[] = [];
  if (categorySlugs.length > 0) {
    categoryRows = await execute<CategorySlugRow>(
      `
        select id, slug
        from public.categories
        where slug = any($1::text[])
      `,
      [categorySlugs],
    );
  }

  let categoryAssignmentRows: Array<
    Pick<CategoryAssignmentRow, "schema_id" | "category_id" | "created_at">
  > = [];
  if (categoryRows.length > 0) {
    categoryAssignmentRows = await execute<
      Pick<CategoryAssignmentRow, "schema_id" | "category_id" | "created_at">
    >(
      `
        select schema_id, category_id, created_at
        from public.category_schema_assignments
        where category_id::text = any($1::text[])
      `,
      [categoryRows.map((row) => row.id)],
    );
  }

  const categorySlugOrder = new Map<string, number>();
  categorySlugs.forEach((slug, index) => categorySlugOrder.set(slug, index));
  const categoriesById = new Map<string, string>();
  categoryRows.forEach((category) => categoriesById.set(category.id, category.slug));

  const candidates = [
    ...productAssignmentRows.map((assignment, index) => ({
      schema_id: assignment.schema_id,
      priority: 0,
      sort_order: assignment.sort_order ?? index,
      specificity: -1,
      created_at: assignment.created_at ?? "",
    })),
    ...categoryAssignmentRows.map((assignment, index) => ({
      schema_id: assignment.schema_id,
      priority: 1,
      sort_order: index,
      specificity:
        categorySlugOrder.get(categoriesById.get(assignment.category_id) ?? "") ??
        Number.MAX_SAFE_INTEGER,
      created_at: assignment.created_at ?? "",
    })),
  ]
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.specificity !== right.specificity) return left.specificity - right.specificity;
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
      return left.created_at.localeCompare(right.created_at);
    })
    .filter(
      (candidate, index, all) =>
        all.findIndex((entry) => entry.schema_id === candidate.schema_id) === index,
    );

  if (candidates.length === 0) {
    return null;
  }

  const activeRows = await execute<SchemaActiveRow>(
    `
      select id, is_active
      from public.product_customization_schemas
      where id::text = any($1::text[])
    `,
    [candidates.map((candidate) => candidate.schema_id)],
  );

  const activeSchemaIds = new Set(
    activeRows.filter((row) => normalizeBoolean(row.is_active)).map((row) => row.id),
  );

  return candidates.find((candidate) => activeSchemaIds.has(candidate.schema_id))?.schema_id ?? null;
}

export async function getLightPostgresCustomizationSchemaForProduct(
  execute: LightPostgresCustomizationReadExecutor,
  productId: string,
): Promise<LightPostgresCustomizationSchemaPayload | null> {
  const schemaId = await resolveLightPostgresAssignedCustomizationSchemaId(execute, productId);
  if (!schemaId) {
    return null;
  }

  return getLightPostgresCustomizationSchemaById(execute, schemaId, {
    activeOnly: true,
  });
}
