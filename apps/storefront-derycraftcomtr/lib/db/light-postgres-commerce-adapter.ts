import "server-only";

import type { PoolClient, QueryResultRow } from "pg";
import { normalizeStoredCustomizations } from "../customization/normalize";
import {
  queryLightPostgres,
  queryLightPostgresOne,
  withLightPostgresTransaction,
} from "./light-postgres-client";

type DbExecutor = Pick<PoolClient, "query">;

type CustomerAddressInput = {
  type?: string;
  title?: string;
  company?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  phone?: string;
  city?: string;
  district?: string;
  state?: string;
  address?: string;
  addressLine?: string;
  addressLine1?: string;
  address_line1?: string;
  addressLine2?: string;
  address_line2?: string;
  postalCode?: string;
  postal_code?: string;
  country?: string;
  isDefault?: boolean;
  is_default?: boolean;
};

type CustomerUpsertInput = {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  notes?: string;
  totalOrders?: number;
  totalSpent?: number;
  tags?: string[];
  externalCustomerId?: string;
  acceptsEmailMarketing?: boolean;
  acceptsSmsMarketing?: boolean;
  taxExempt?: boolean;
  userId?: string | null;
  isActive?: boolean;
};

type OrderCreateInput = {
  customerId?: string;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    price: number;
    quantity: number;
    category?: string;
    customization?: {
      schema_id: string;
      schema_snapshot?: unknown;
      selections: unknown[];
      price_breakdown?: unknown;
      custom_text_content?: string | null;
      uploaded_files?: unknown[];
    } | null;
  }[];
  shippingAddress: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  paymentMethod: string;
  shippingCost?: number;
  discount?: number;
  couponCode?: string | null;
  notes?: string;
  contactEmail?: string;
  saveAddress?: boolean;
  abandonedCartSessionId?: string | null;
  sourceType?: string;
  sourceRefId?: string | null;
};

type OrderListOptions = {
  status?: string;
  limit?: number;
  offset?: number;
};

type OrdersByCustomerOptions = {
  excludeOrderId?: string | null;
  limit?: number;
};

type LightPostgresPaymentAttemptInput = {
  orderId?: string | null;
  quickOrderLinkId?: string | null;
  gatewayId: string;
  provider: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  customerEmail?: string;
  customerIp?: string;
  requestPayload?: Record<string, unknown>;
};

type LightPostgresPaymentAttemptUpdateInput = {
  status?: string;
  checkoutToken?: string | null;
  redirectUrl?: string | null;
  providerPaymentId?: string | null;
  providerReferenceId?: string | null;
  conversationId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  responsePayload?: Record<string, unknown>;
  callbackPayload?: Record<string, unknown>;
  callbackReceivedAt?: string | null;
  completedAt?: string | null;
};

type LightPostgresPaymentEventInput = {
  provider: string;
  gatewayId?: string;
  paymentAttemptId?: string;
  orderId?: string;
  quickOrderLinkId?: string;
  eventType?: string;
  status?: string;
  signature?: string;
  headers?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  errorMessage?: string;
  processedAt?: string;
};

type CustomerRow = {
  id: string;
  email: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  total_orders: number | string | null;
  total_spent: number | string | null;
  last_order_at: string | null;
  notes: string | null;
  tags: string[] | null;
  external_customer_id: string | null;
  accepts_email_marketing: boolean | null;
  accepts_sms_marketing: boolean | null;
  tax_exempt: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type CustomerAddressRow = {
  id: string;
  customer_id: string;
  type: string | null;
  title: string | null;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: string;
  subtotal: number | string | null;
  shipping_cost: number | string | null;
  discount: number | string | null;
  total: number | string | null;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  source_type: string | null;
  source_ref_id: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  internal_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  product_image: string | null;
  price: number | string | null;
  quantity: number | string | null;
  total: number | string | null;
  created_at: string | null;
};

type OrderItemCustomizationRow = {
  id: string;
  order_item_id: string;
  schema_id: string | null;
  schema_snapshot_id: string | null;
  schema_version: number | null;
  schema_snapshot: unknown;
  selections: unknown;
  price_breakdown: unknown;
  custom_text_content: string | null;
  uploaded_files: unknown;
  production_status: string | null;
  step_values: unknown;
  calculated_price: number | string | null;
  created_at: string | null;
};

type PaymentRow = {
  id: string;
  order_id: string | null;
  quick_order_link_id: string | null;
  gateway_id: string;
  provider: string;
  status: string;
  amount: number | string;
  currency: string;
  idempotency_key: string;
  checkout_token: string | null;
  redirect_url: string | null;
  provider_payment_id: string | null;
  provider_reference_id: string | null;
  conversation_id: string | null;
  customer_email: string | null;
  customer_ip: string | null;
  error_code: string | null;
  error_message: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  callback_payload: Record<string, unknown> | null;
  callback_received_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PaymentEventRow = {
  id: string;
  provider: string;
  gateway_id: string | null;
  payment_id: string | null;
  order_id: string | null;
  quick_order_link_id: string | null;
  event_type: string | null;
  status: string;
  signature: string | null;
  headers: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeTags(tags?: string[] | null): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter(Boolean),
    ),
  );
}

function normalizeAddressType(input: CustomerAddressInput): string {
  if (input.type) {
    return input.type;
  }

  const title = String(input.title || "").trim().toLowerCase();
  if (title.includes("fatura") || title.includes("billing")) {
    return "billing";
  }

  return "shipping";
}

function normalizeAddressRow(row: CustomerAddressRow) {
  const addressLine1 = row.address_line1 ?? row.address ?? null;
  const district = row.district ?? row.state ?? null;
  const state = row.state ?? row.district ?? null;

  return {
    ...row,
    address: row.address ?? addressLine1,
    address_line1: addressLine1,
    district,
    state,
    country: row.country ?? "TR",
    is_default: Boolean(row.is_default),
  };
}

function buildCustomerUpdatePayload(input: Partial<CustomerUpsertInput>) {
  const payload: Record<string, unknown> = {};

  if (input.phone !== undefined) payload.phone = input.phone || null;
  if (input.firstName !== undefined) payload.first_name = input.firstName || null;
  if (input.lastName !== undefined) payload.last_name = input.lastName || null;
  if (input.status !== undefined) payload.status = input.status || "active";
  if (input.notes !== undefined) payload.notes = input.notes || null;
  if (input.totalOrders !== undefined) payload.total_orders = input.totalOrders;
  if (input.totalSpent !== undefined) payload.total_spent = input.totalSpent;
  if (input.tags !== undefined) payload.tags = normalizeTags(input.tags);
  if (input.externalCustomerId !== undefined) {
    payload.external_customer_id = input.externalCustomerId || null;
  }
  if (input.acceptsEmailMarketing !== undefined) {
    payload.accepts_email_marketing = input.acceptsEmailMarketing;
  }
  if (input.acceptsSmsMarketing !== undefined) {
    payload.accepts_sms_marketing = input.acceptsSmsMarketing;
  }
  if (input.taxExempt !== undefined) {
    payload.tax_exempt = input.taxExempt;
  }
  if (input.userId !== undefined) {
    payload.user_id = input.userId || null;
  }
  if (input.isActive !== undefined) {
    payload.is_active = input.isActive;
  }

  return payload;
}

function buildCustomerAddressRow(
  customerId: string,
  address: CustomerAddressInput,
  index: number,
) {
  const addressLine1 =
    address.addressLine ??
    address.addressLine1 ??
    address.address_line1 ??
    address.address ??
    null;

  const district = address.district ?? address.state ?? null;

  return {
    customer_id: customerId,
    type: normalizeAddressType(address),
    title: address.title || null,
    company: address.company || null,
    first_name: address.firstName ?? address.first_name ?? null,
    last_name: address.lastName ?? address.last_name ?? null,
    phone: address.phone || null,
    address: address.address ?? addressLine1,
    address_line1: addressLine1,
    address_line2: address.addressLine2 ?? address.address_line2 ?? null,
    city: address.city || null,
    district,
    state: address.state ?? district,
    postal_code: address.postalCode ?? address.postal_code ?? null,
    country: address.country || "TR",
    is_default: address.isDefault ?? address.is_default ?? index === 0,
  };
}

async function clientQuery<TRow extends QueryResultRow = QueryResultRow>(
  client: DbExecutor,
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const result = await client.query<TRow>(text, [...params]);
  return result.rows;
}

async function readRows<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client?: DbExecutor,
): Promise<TRow[]> {
  return client
    ? clientQuery<TRow>(client, text, params)
    : queryLightPostgres<TRow>(text, params);
}

async function readRow<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  client?: DbExecutor,
): Promise<TRow | null> {
  if (client) {
    const [row] = await clientQuery<TRow>(client, text, params);
    return row ?? null;
  }

  return queryLightPostgresOne<TRow>(text, params);
}

async function listCustomerAddressesByCustomerIds(
  customerIds: readonly string[],
  client?: DbExecutor,
) {
  if (customerIds.length === 0) {
    return new Map<string, ReturnType<typeof normalizeAddressRow>[]>();
  }

  const rows = await readRows<CustomerAddressRow>(
    `
      select *
      from public.customer_addresses
      where customer_id = any($1::uuid[])
      order by is_default desc, created_at asc
    `,
    [customerIds],
    client,
  );

  const grouped = new Map<string, ReturnType<typeof normalizeAddressRow>[]>();
  for (const row of rows) {
    const normalized = normalizeAddressRow(row);
    const existing = grouped.get(row.customer_id) ?? [];
    existing.push(normalized);
    grouped.set(row.customer_id, existing);
  }

  return grouped;
}

async function hydrateOrderItemsByOrderIds(
  orderIds: readonly string[],
  client?: DbExecutor,
) {
  if (orderIds.length === 0) {
    return new Map<string, Record<string, unknown>[]>();
  }

  const itemRows = await readRows<OrderItemRow>(
    `
      select *
      from public.order_items
      where order_id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [orderIds],
    client,
  );

  const itemIds = itemRows.map((row) => row.id);
  const customizationRows = itemIds.length
    ? await readRows<OrderItemCustomizationRow>(
        `
          select *
          from public.order_item_customizations
          where order_item_id = any($1::uuid[])
          order by created_at asc, id asc
        `,
        [itemIds],
        client,
      )
    : [];

  const customizationMap = new Map<string, OrderItemCustomizationRow[]>();
  for (const customization of customizationRows) {
    const existing = customizationMap.get(customization.order_item_id) ?? [];
    existing.push(customization);
    customizationMap.set(customization.order_item_id, existing);
  }

  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const item of itemRows) {
    const existing = grouped.get(item.order_id) ?? [];
    existing.push({
      ...item,
      price: toNumber(item.price),
      quantity: toNumber(item.quantity),
      total: toNumber(item.total),
      customizations: normalizeStoredCustomizations(customizationMap.get(item.id) ?? []),
    });
    grouped.set(item.order_id, existing);
  }

  return grouped;
}

function attachItemsToOrders(
  rows: readonly OrderRow[],
  itemsByOrderId: Map<string, Record<string, unknown>[]>,
) {
  return rows.map((row) => ({
    ...row,
    subtotal: toNumber(row.subtotal),
    shipping_cost: toNumber(row.shipping_cost),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    items: itemsByOrderId.get(row.id) ?? [],
  }));
}

function buildOrderFilterSql(options?: OrderListOptions) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options?.status) {
    params.push(options.status);
    clauses.push(`status = $${params.length}`);
  }

  let sql = `
    select *
    from public.orders
  `;

  if (clauses.length > 0) {
    sql += ` where ${clauses.join(" and ")}`;
  }

  sql += " order by created_at desc";

  if (typeof options?.limit === "number") {
    params.push(options.limit);
    sql += ` limit $${params.length}`;
  }

  if (typeof options?.offset === "number") {
    params.push(options.offset);
    sql += ` offset $${params.length}`;
  }

  return { sql, params };
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EZM-${timestamp}-${random}`;
}

function buildLegacyStepValues(customization: NonNullable<OrderCreateInput["items"][number]["customization"]>) {
  return customization.selections.reduce<Record<string, unknown>>((acc, selection) => {
    if (selection && typeof selection === "object" && "step_key" in selection) {
      const stepKey = String((selection as { step_key?: unknown }).step_key || "");
      acc[stepKey] = (selection as { value?: unknown }).value;
    }
    return acc;
  }, {});
}

function readCustomizationTotalAdjustment(value: unknown) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  return toNumber((value as { total_adjustment?: unknown }).total_adjustment, 0);
}

export async function getLightPostgresCustomers(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (options?.search?.trim()) {
    params.push(`%${options.search.trim().toLowerCase()}%`);
    clauses.push(
      `(lower(email) like $${params.length} or lower(coalesce(first_name, '')) like $${params.length} or lower(coalesce(last_name, '')) like $${params.length})`,
    );
  }

  let sql = "select * from public.customers";
  if (clauses.length > 0) {
    sql += ` where ${clauses.join(" and ")}`;
  }
  sql += " order by created_at desc";

  if (typeof options?.limit === "number") {
    params.push(options.limit);
    sql += ` limit $${params.length}`;
  }

  if (typeof options?.offset === "number") {
    params.push(options.offset);
    sql += ` offset $${params.length}`;
  }

  const rows = await readRows<CustomerRow>(sql, params);
  const addressesByCustomerId = await listCustomerAddressesByCustomerIds(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    total_orders: toNumber(row.total_orders),
    total_spent: toNumber(row.total_spent),
    tags: normalizeTags(row.tags),
    accepts_email_marketing: Boolean(row.accepts_email_marketing),
    accepts_sms_marketing: Boolean(row.accepts_sms_marketing),
    tax_exempt: Boolean(row.tax_exempt),
    is_active: Boolean(row.is_active ?? true),
    addresses: addressesByCustomerId.get(row.id) ?? [],
  }));
}

export async function getLightPostgresCustomerById(id: string) {
  const row = await readRow<CustomerRow>(
    "select * from public.customers where id = $1::uuid",
    [id],
  );

  if (!row) {
    return null;
  }

  const [addressesByCustomerId, orders] = await Promise.all([
    listCustomerAddressesByCustomerIds([id]),
    getLightPostgresOrdersByCustomerId(id, { limit: 50 }),
  ]);

  return {
    ...row,
    total_orders: toNumber(row.total_orders),
    total_spent: toNumber(row.total_spent),
    tags: normalizeTags(row.tags),
    accepts_email_marketing: Boolean(row.accepts_email_marketing),
    accepts_sms_marketing: Boolean(row.accepts_sms_marketing),
    tax_exempt: Boolean(row.tax_exempt),
    is_active: Boolean(row.is_active ?? true),
    addresses: addressesByCustomerId.get(id) ?? [],
    orders,
  };
}

export async function getLightPostgresCustomerByEmail(email: string, client?: DbExecutor) {
  const normalizedEmail = email.trim().toLowerCase();
  const row = await readRow<CustomerRow>(
    "select * from public.customers where lower(email) = $1 limit 1",
    [normalizedEmail],
    client,
  );

  if (!row) {
    return null;
  }

  const addressesByCustomerId = await listCustomerAddressesByCustomerIds([row.id], client);

  return {
    ...row,
    total_orders: toNumber(row.total_orders),
    total_spent: toNumber(row.total_spent),
    tags: normalizeTags(row.tags),
    accepts_email_marketing: Boolean(row.accepts_email_marketing),
    accepts_sms_marketing: Boolean(row.accepts_sms_marketing),
    tax_exempt: Boolean(row.tax_exempt),
    is_active: Boolean(row.is_active ?? true),
    addresses: addressesByCustomerId.get(row.id) ?? [],
  };
}

export async function getOrCreateLightPostgresCustomer(
  input: CustomerUpsertInput,
  client?: DbExecutor,
) {
  const existing = await getLightPostgresCustomerByEmail(input.email, client);
  const payload = buildCustomerUpdatePayload(input);

  if (existing) {
    if (Object.keys(payload).length > 0) {
      const assignments = Object.keys(payload)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(", ");

      const updated = await readRow<CustomerRow>(
        `
          update public.customers
          set ${assignments}
          where id = $1::uuid
          returning *
        `,
        [existing.id, ...Object.values(payload)],
        client,
      );

      if (updated) {
        const addressesByCustomerId = await listCustomerAddressesByCustomerIds([updated.id], client);
        return {
          ...updated,
          total_orders: toNumber(updated.total_orders),
          total_spent: toNumber(updated.total_spent),
          tags: normalizeTags(updated.tags),
          accepts_email_marketing: Boolean(updated.accepts_email_marketing),
          accepts_sms_marketing: Boolean(updated.accepts_sms_marketing),
          tax_exempt: Boolean(updated.tax_exempt),
          is_active: Boolean(updated.is_active ?? true),
          addresses: addressesByCustomerId.get(updated.id) ?? [],
        };
      }
    }

    return existing;
  }

  const inserted = await readRow<CustomerRow>(
    `
      insert into public.customers (
        email,
        status,
        phone,
        first_name,
        last_name,
        notes,
        total_orders,
        total_spent,
        tags,
        external_customer_id,
        accepts_email_marketing,
        accepts_sms_marketing,
        tax_exempt,
        user_id,
        is_active
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::text[],
        $10,
        $11,
        $12,
        $13,
        $14,
        $15
      )
      returning *
    `,
    [
      input.email.trim(),
      input.status || "active",
      input.phone || null,
      input.firstName || null,
      input.lastName || null,
      input.notes || null,
      input.totalOrders ?? 0,
      input.totalSpent ?? 0,
      normalizeTags(input.tags),
      input.externalCustomerId || null,
      input.acceptsEmailMarketing ?? false,
      input.acceptsSmsMarketing ?? false,
      input.taxExempt ?? false,
      input.userId || null,
      input.isActive ?? true,
    ],
    client,
  );

  if (!inserted) {
    throw new Error("Light Postgres customer olusturulamadi.");
  }

  return {
    ...inserted,
    total_orders: toNumber(inserted.total_orders),
    total_spent: toNumber(inserted.total_spent),
    tags: normalizeTags(inserted.tags),
    accepts_email_marketing: Boolean(inserted.accepts_email_marketing),
    accepts_sms_marketing: Boolean(inserted.accepts_sms_marketing),
    tax_exempt: Boolean(inserted.tax_exempt),
    is_active: Boolean(inserted.is_active ?? true),
    addresses: [],
  };
}

export async function updateLightPostgresCustomer(id: string, updates: Record<string, unknown>) {
  if (Object.keys(updates).length === 0) {
    return getLightPostgresCustomerById(id);
  }

  const assignments = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(", ");

  const row = await readRow<CustomerRow>(
    `
      update public.customers
      set ${assignments}
      where id = $1::uuid
      returning *
    `,
    [id, ...Object.values(updates)],
  );

  if (!row) {
    return null;
  }

  const addressesByCustomerId = await listCustomerAddressesByCustomerIds([id]);

  return {
    ...row,
    total_orders: toNumber(row.total_orders),
    total_spent: toNumber(row.total_spent),
    tags: normalizeTags(row.tags),
    accepts_email_marketing: Boolean(row.accepts_email_marketing),
    accepts_sms_marketing: Boolean(row.accepts_sms_marketing),
    tax_exempt: Boolean(row.tax_exempt),
    is_active: Boolean(row.is_active ?? true),
    addresses: addressesByCustomerId.get(id) ?? [],
  };
}

export async function replaceLightPostgresCustomerAddresses(
  customerId: string,
  addresses: CustomerAddressInput[],
) {
  return withLightPostgresTransaction(async (client) => {
    await clientQuery(client, "delete from public.customer_addresses where customer_id = $1::uuid", [
      customerId,
    ]);

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return [];
    }

    const inserted: Record<string, unknown>[] = [];
    for (const [index, address] of addresses.entries()) {
      const row = buildCustomerAddressRow(customerId, address, index);
      const insertedRow = await readRow<CustomerAddressRow>(
        `
          insert into public.customer_addresses (
            customer_id,
            type,
            title,
            company,
            first_name,
            last_name,
            phone,
            address,
            address_line1,
            address_line2,
            city,
            district,
            state,
            postal_code,
            country,
            is_default
          )
          values (
            $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16
          )
          returning *
        `,
        [
          row.customer_id,
          row.type,
          row.title,
          row.company,
          row.first_name,
          row.last_name,
          row.phone,
          row.address,
          row.address_line1,
          row.address_line2,
          row.city,
          row.district,
          row.state,
          row.postal_code,
          row.country,
          row.is_default,
        ],
        client,
      );

      if (insertedRow) {
        inserted.push(normalizeAddressRow(insertedRow));
      }
    }

    return inserted;
  });
}

export async function deleteLightPostgresCustomer(_id: string) {
  throw new Error("Light Postgres customer delete MVP kapsaminda devre disi.");
}

export async function getLightPostgresCustomerStats() {
  const counts = await readRow<{
    total_customers: number | string;
    new_customers_this_month: number | string;
    total_revenue: number | string;
    total_orders: number | string;
  }>(
    `
      select
        count(*) as total_customers,
        count(*) filter (where created_at >= date_trunc('month', now())) as new_customers_this_month,
        coalesce(sum(total_spent), 0) as total_revenue,
        coalesce(sum(total_orders), 0) as total_orders
      from public.customers
    `,
  );

  return {
    totalCustomers: toNumber(counts?.total_customers),
    newCustomersThisMonth: toNumber(counts?.new_customers_this_month),
    totalRevenue: toNumber(counts?.total_revenue),
    averageOrderValue:
      toNumber(counts?.total_orders) > 0
        ? toNumber(counts?.total_revenue) / toNumber(counts?.total_orders)
        : 0,
  };
}

export async function createLightPostgresOrder(orderData: OrderCreateInput) {
  return withLightPostgresTransaction(async (client) => {
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = orderData.shippingCost || 0;
    const discount = orderData.discount || 0;
    const total = subtotal + shippingCost - discount;
    const couponCode = orderData.couponCode?.trim().toUpperCase() || null;
    const notesWithCoupon = [orderData.notes?.trim(), couponCode ? `Kupon: ${couponCode}` : null]
      .filter(Boolean)
      .join(" | ") || null;

    let customerId = orderData.customerId || null;
    if (!customerId && orderData.contactEmail) {
      const shipping = orderData.shippingAddress as {
        firstName?: string;
        lastName?: string;
        phone?: string;
      };
      const customer = await getOrCreateLightPostgresCustomer(
        {
          email: orderData.contactEmail,
          phone: shipping.phone,
          firstName: shipping.firstName,
          lastName: shipping.lastName,
        },
        client,
      );
      customerId = customer.id;
    }

    const order = await readRow<OrderRow>(
      `
        insert into public.orders (
          order_number,
          customer_id,
          status,
          subtotal,
          shipping_cost,
          discount,
          total,
          shipping_address,
          billing_address,
          payment_method,
          payment_status,
          notes,
          source_type,
          source_ref_id
        )
        values (
          $1,
          $2::uuid,
          'pending',
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          $8::jsonb,
          $9,
          'pending',
          $10,
          $11,
          $12
        )
        returning *
      `,
      [
        generateOrderNumber(),
        customerId,
        subtotal,
        shippingCost,
        discount,
        total,
        orderData.shippingAddress,
        orderData.billingAddress || orderData.shippingAddress,
        orderData.paymentMethod,
        notesWithCoupon,
        orderData.sourceType || "storefront_checkout",
        orderData.sourceRefId || null,
      ],
      client,
    );

    if (!order) {
      throw new Error("Light Postgres siparis olusturulamadi.");
    }

    const insertedItems: Record<string, unknown>[] = [];

    for (const item of orderData.items) {
      const insertedItem = await readRow<OrderItemRow>(
        `
          insert into public.order_items (
            order_id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            price,
            quantity,
            total
          )
          values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
          returning *
        `,
        [
          order.id,
          item.productId,
          item.variantId,
          item.productName,
          item.variantName,
          item.price,
          item.quantity,
          item.price * item.quantity,
        ],
        client,
      );

      if (!insertedItem) {
        throw new Error("Light Postgres siparis kalemi olusturulamadi.");
      }

      if (item.customization) {
        await clientQuery(
          client,
          `
            insert into public.order_item_customizations (
              order_item_id,
              schema_id,
              schema_snapshot_id,
              schema_version,
              schema_snapshot,
              selections,
              price_breakdown,
              custom_text_content,
              uploaded_files,
              production_status,
              step_values,
              calculated_price
            )
            values (
              $1::uuid,
              $2,
              $3,
              $4,
              $5::jsonb,
              $6::jsonb,
              $7::jsonb,
              $8,
              $9::jsonb,
              $10,
              $11::jsonb,
              $12
            )
          `,
          [
            insertedItem.id,
            item.customization.schema_id,
            item.customization.schema_id,
            1,
            item.customization.schema_snapshot ?? {},
            item.customization.selections ?? [],
            item.customization.price_breakdown ?? {},
            item.customization.custom_text_content || null,
            item.customization.uploaded_files ?? [],
            "pending",
            buildLegacyStepValues(item.customization),
            readCustomizationTotalAdjustment(item.customization.price_breakdown),
          ],
        );
      }

      insertedItems.push({
        ...insertedItem,
        price: toNumber(insertedItem.price),
        quantity: toNumber(insertedItem.quantity),
        total: toNumber(insertedItem.total),
        customizations: item.customization ? normalizeStoredCustomizations([{
          order_item_id: insertedItem.id,
          schema_id: item.customization.schema_id,
          schema_snapshot_id: item.customization.schema_id,
          schema_version: 1,
          schema_snapshot: item.customization.schema_snapshot ?? {},
          selections: item.customization.selections ?? [],
          price_breakdown: item.customization.price_breakdown ?? {},
          custom_text_content: item.customization.custom_text_content || null,
          uploaded_files: item.customization.uploaded_files ?? [],
          production_status: "pending",
          step_values: buildLegacyStepValues(item.customization),
          calculated_price: readCustomizationTotalAdjustment(item.customization.price_breakdown),
          created_at: new Date().toISOString(),
          id: `runtime-${insertedItem.id}`,
        }]) : [],
      });
    }

    if (customerId) {
      await clientQuery(
        client,
        `
          update public.customers
          set
            total_orders = coalesce(total_orders, 0) + 1,
            total_spent = coalesce(total_spent, 0) + $2,
            last_order_at = now()
          where id = $1::uuid
        `,
        [customerId, total],
      );
    }

    if (customerId && orderData.saveAddress !== false) {
      const [existingAddress] = await clientQuery<{ id: string }>(
        client,
        `
          select id
          from public.customer_addresses
          where customer_id = $1::uuid
          limit 1
        `,
        [customerId],
      );

      const shipping = orderData.shippingAddress as {
        firstName?: string;
        lastName?: string;
        phone?: string;
        address?: string;
        city?: string;
        district?: string;
        postalCode?: string;
      };

      await clientQuery(
        client,
        `
          insert into public.customer_addresses (
            customer_id,
            type,
            title,
            first_name,
            last_name,
            phone,
            address,
            address_line1,
            city,
            district,
            state,
            postal_code,
            country,
            is_default
          )
          values (
            $1::uuid,
            'shipping',
            'Varsayilan Adres',
            $2,
            $3,
            $4,
            $5,
            $5,
            $6,
            $7,
            $7,
            $8,
            'TR',
            $9
          )
        `,
        [
          customerId,
          shipping.firstName || null,
          shipping.lastName || null,
          shipping.phone || null,
          shipping.address || null,
          shipping.city || null,
          shipping.district || null,
          shipping.postalCode || null,
          !existingAddress,
        ],
      );
    }

    return {
      ...order,
      subtotal: toNumber(order.subtotal),
      shipping_cost: toNumber(order.shipping_cost),
      discount: toNumber(order.discount),
      total: toNumber(order.total),
      items: insertedItems,
    };
  });
}

export async function getLightPostgresOrders(options?: OrderListOptions) {
  const { sql, params } = buildOrderFilterSql(options);
  const rows = await readRows<OrderRow>(sql, params);
  const itemsByOrderId = await hydrateOrderItemsByOrderIds(rows.map((row) => row.id));
  return attachItemsToOrders(rows, itemsByOrderId);
}

export async function getLightPostgresOrdersByCustomerId(
  customerId: string,
  options?: OrdersByCustomerOptions,
) {
  const params: unknown[] = [customerId];
  const clauses = ["customer_id = $1::uuid"];

  if (options?.excludeOrderId) {
    params.push(options.excludeOrderId);
    clauses.push(`id <> $${params.length}::uuid`);
  }

  let sql = `
    select *
    from public.orders
    where ${clauses.join(" and ")}
    order by created_at desc
  `;

  if (typeof options?.limit === "number") {
    params.push(options.limit);
    sql += ` limit $${params.length}`;
  }

  const rows = await readRows<OrderRow>(sql, params);
  const itemsByOrderId = await hydrateOrderItemsByOrderIds(rows.map((row) => row.id));
  return attachItemsToOrders(rows, itemsByOrderId);
}

export async function getLightPostgresOrderById(id: string) {
  const row = await readRow<OrderRow>(
    "select * from public.orders where id = $1::uuid",
    [id],
  );

  if (!row) {
    return null;
  }

  const itemsByOrderId = await hydrateOrderItemsByOrderIds([row.id]);
  const [order] = attachItemsToOrders([row], itemsByOrderId);
  return order ?? null;
}

export async function getLightPostgresOrderByNumber(orderNumber: string) {
  const row = await readRow<OrderRow>(
    "select * from public.orders where order_number = $1",
    [orderNumber],
  );

  if (!row) {
    return null;
  }

  const itemsByOrderId = await hydrateOrderItemsByOrderIds([row.id]);
  const [order] = attachItemsToOrders([row], itemsByOrderId);
  return order ?? null;
}

export async function getLightPostgresOrderBySourceRef(sourceType: string, sourceRefId: string) {
  const row = await readRow<OrderRow>(
    `
      select *
      from public.orders
      where source_type = $1
        and source_ref_id = $2
      limit 1
    `,
    [sourceType, sourceRefId],
  );

  if (!row) {
    return null;
  }

  const itemsByOrderId = await hydrateOrderItemsByOrderIds([row.id]);
  const [order] = attachItemsToOrders([row], itemsByOrderId);
  return order ?? null;
}

export async function updateLightPostgresOrderStatus(id: string, status: string) {
  return withLightPostgresTransaction(async (client) => {
    const current = await readRow<OrderRow>(
      "select * from public.orders where id = $1::uuid",
      [id],
      client,
    );

    if (!current) {
      throw new Error("Siparis bulunamadi.");
    }

    const updated = await readRow<OrderRow>(
      `
        update public.orders
        set status = $2
        where id = $1::uuid
        returning *
      `,
      [id, status],
      client,
    );

    if (!updated) {
      throw new Error("Siparis durumu guncellenemedi.");
    }

    await clientQuery(
      client,
      `
        insert into public.order_status_history (
          order_id,
          previous_status,
          next_status,
          previous_payment_status,
          next_payment_status,
          source,
          metadata
        )
        values ($1::uuid, $2, $3, $4, $5, 'light_postgres_phase1', $6::jsonb)
      `,
      [
        id,
        current.status,
        status,
        current.payment_status,
        current.payment_status,
        { reason: "updateOrderStatus" },
      ],
    );

    return {
      ...updated,
      subtotal: toNumber(updated.subtotal),
      shipping_cost: toNumber(updated.shipping_cost),
      discount: toNumber(updated.discount),
      total: toNumber(updated.total),
    };
  });
}

export async function updateLightPostgresPaymentStatus(id: string, paymentStatus: string) {
  return withLightPostgresTransaction(async (client) => {
    const current = await readRow<OrderRow>(
      "select * from public.orders where id = $1::uuid",
      [id],
      client,
    );

    if (!current) {
      throw new Error("Siparis bulunamadi.");
    }

    const updated = await readRow<OrderRow>(
      `
        update public.orders
        set payment_status = $2
        where id = $1::uuid
        returning *
      `,
      [id, paymentStatus],
      client,
    );

    if (!updated) {
      throw new Error("Odeme durumu guncellenemedi.");
    }

    await clientQuery(
      client,
      `
        insert into public.order_status_history (
          order_id,
          previous_status,
          next_status,
          previous_payment_status,
          next_payment_status,
          source,
          metadata
        )
        values ($1::uuid, $2, $3, $4, $5, 'light_postgres_phase1', $6::jsonb)
      `,
      [
        id,
        current.status,
        current.status,
        current.payment_status,
        paymentStatus,
        { reason: "updatePaymentStatus" },
      ],
    );

    return {
      ...updated,
      subtotal: toNumber(updated.subtotal),
      shipping_cost: toNumber(updated.shipping_cost),
      discount: toNumber(updated.discount),
      total: toNumber(updated.total),
    };
  });
}

export async function deleteLightPostgresOrder(_id: string) {
  throw new Error("Light Postgres destructive order delete MVP kapsaminda devre disi.");
}

export async function getLightPostgresOrderStats() {
  const stats = await readRow<{
    total_orders: number | string;
    total_revenue: number | string;
    today_orders: number | string;
    today_revenue: number | string;
    month_orders: number | string;
    month_revenue: number | string;
    pending_orders: number | string;
  }>(
    `
      select
        count(*) as total_orders,
        coalesce(sum(total), 0) as total_revenue,
        count(*) filter (where created_at >= date_trunc('day', now())) as today_orders,
        coalesce(sum(total) filter (where created_at >= date_trunc('day', now())), 0) as today_revenue,
        count(*) filter (where created_at >= date_trunc('month', now())) as month_orders,
        coalesce(sum(total) filter (where created_at >= date_trunc('month', now())), 0) as month_revenue,
        count(*) filter (where status = 'pending') as pending_orders
      from public.orders
    `,
  );

  return {
    totalOrders: toNumber(stats?.total_orders),
    totalRevenue: toNumber(stats?.total_revenue),
    todayOrders: toNumber(stats?.today_orders),
    todayRevenue: toNumber(stats?.today_revenue),
    monthOrders: toNumber(stats?.month_orders),
    monthRevenue: toNumber(stats?.month_revenue),
    pendingOrders: toNumber(stats?.pending_orders),
  };
}

export async function createLightPostgresPaymentAttempt(input: LightPostgresPaymentAttemptInput) {
  if (!input.orderId && !input.quickOrderLinkId) {
    throw new Error("Payment attempt bir order veya hizli siparis linkine bagli olmalidir.");
  }

  const row = await readRow<PaymentRow>(
    `
      insert into public.payments (
        order_id,
        quick_order_link_id,
        gateway_id,
        provider,
        amount,
        currency,
        idempotency_key,
        customer_email,
        customer_ip,
        request_payload
      )
      values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      returning *
    `,
    [
      input.orderId ?? null,
      input.quickOrderLinkId ?? null,
      input.gatewayId,
      input.provider,
      input.amount,
      input.currency,
      input.idempotencyKey,
      input.customerEmail ?? null,
      input.customerIp ?? null,
      input.requestPayload ?? {},
    ],
  );

  if (!row) {
    throw new Error("Light Postgres payment kaydi olusturulamadi.");
  }

  return row;
}

export async function getLightPostgresPaymentAttemptById(id: string) {
  return readRow<PaymentRow>("select * from public.payments where id = $1::uuid", [id]);
}

export async function getLightPostgresPaymentAttemptByToken(token: string) {
  return readRow<PaymentRow>("select * from public.payments where checkout_token = $1", [token]);
}

export async function getLightPostgresPaymentAttemptByProviderReferenceId(referenceId: string) {
  return readRow<PaymentRow>(
    "select * from public.payments where provider_reference_id = $1",
    [referenceId],
  );
}

export async function updateLightPostgresPaymentAttempt(
  id: string,
  updates: LightPostgresPaymentAttemptUpdateInput,
) {
  const payload: Record<string, unknown> = {
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.checkoutToken !== undefined ? { checkout_token: updates.checkoutToken } : {}),
    ...(updates.redirectUrl !== undefined ? { redirect_url: updates.redirectUrl } : {}),
    ...(updates.providerPaymentId !== undefined ? { provider_payment_id: updates.providerPaymentId } : {}),
    ...(updates.providerReferenceId !== undefined ? { provider_reference_id: updates.providerReferenceId } : {}),
    ...(updates.conversationId !== undefined ? { conversation_id: updates.conversationId } : {}),
    ...(updates.errorCode !== undefined ? { error_code: updates.errorCode } : {}),
    ...(updates.errorMessage !== undefined ? { error_message: updates.errorMessage } : {}),
    ...(updates.responsePayload !== undefined ? { response_payload: updates.responsePayload ?? {} } : {}),
    ...(updates.callbackPayload !== undefined ? { callback_payload: updates.callbackPayload ?? {} } : {}),
    ...(updates.callbackReceivedAt !== undefined ? { callback_received_at: updates.callbackReceivedAt } : {}),
    ...(updates.completedAt !== undefined ? { completed_at: updates.completedAt } : {}),
  };

  const assignments = Object.keys(payload)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(", ");

  if (!assignments) {
    return getLightPostgresPaymentAttemptById(id);
  }

  return readRow<PaymentRow>(
    `
      update public.payments
      set ${assignments}
      where id = $1::uuid
      returning *
    `,
    [id, ...Object.values(payload)],
  );
}

export async function createLightPostgresPaymentEvent(input: LightPostgresPaymentEventInput) {
  const row = await readRow<PaymentEventRow>(
    `
      insert into public.payment_events (
        provider,
        gateway_id,
        payment_id,
        order_id,
        quick_order_link_id,
        event_type,
        status,
        signature,
        headers,
        payload,
        error_message,
        processed_at
      )
      values (
        $1, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12
      )
      returning *
    `,
    [
      input.provider,
      input.gatewayId ?? null,
      input.paymentAttemptId ?? null,
      input.orderId ?? null,
      input.quickOrderLinkId ?? null,
      input.eventType ?? null,
      input.status ?? "received",
      input.signature ?? null,
      input.headers ?? {},
      input.payload ?? {},
      input.errorMessage ?? null,
      input.processedAt ?? null,
    ],
  );

  if (!row) {
    throw new Error("Light Postgres payment event kaydi olusturulamadi.");
  }

  return row;
}
