import { createServerClient, type Address } from "@/lib/supabase";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { queryAdminLightPostgres, queryAdminLightPostgresOne } from "@/lib/db/light-postgres-client";

export interface CustomerAddressInput {
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
}

export interface CustomerUpsertInput {
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
}

type LightPostgresCustomerRow = Record<string, unknown> & {
  id: string;
  email: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  total_orders: number | string | null;
  total_spent: number | string | null;
  last_order_at: string | null;
  notes: string | null;
  tags: unknown;
  external_customer_id: string | null;
  accepts_email_marketing: boolean | null;
  accepts_sms_marketing: boolean | null;
  tax_exempt: boolean | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

type LightPostgresCustomerAddressRow = Record<string, unknown> & {
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
  created_at: string;
  updated_at: string;
};

type LightPostgresCustomerOrderRow = Record<string, unknown> & {
  id: string;
  customer_id: string | null;
  order_number: string;
  status: string;
  total: number | string;
  payment_status: string;
  created_at: string;
  updated_at: string;
};

function normalizeTags(tags?: string[]) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "f", "0", "no", "n"].includes(normalized)) return false;
  }

  return null;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

async function hydrateLightPostgresCustomers(rows: LightPostgresCustomerRow[]) {
  if (rows.length === 0) {
    return [];
  }

  const customerIds = rows.map((row) => row.id);
  const [addresses, orders] = await Promise.all([
    queryAdminLightPostgres<LightPostgresCustomerAddressRow>(
      `
        select
          id,
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
          is_default,
          created_at,
          updated_at
        from public.customer_addresses
        where customer_id = any($1::uuid[])
        order by is_default desc, created_at asc
      `,
      [customerIds],
    ),
    queryAdminLightPostgres<LightPostgresCustomerOrderRow>(
      `
        select
          id,
          customer_id,
          order_number,
          status,
          total,
          payment_status,
          created_at,
          updated_at
        from public.orders
        where customer_id = any($1::uuid[])
        order by created_at desc
      `,
      [customerIds],
    ),
  ]);

  const addressesByCustomer = new Map<string, LightPostgresCustomerAddressRow[]>();
  for (const address of addresses) {
    const bucket = addressesByCustomer.get(address.customer_id) ?? [];
    bucket.push(address);
    addressesByCustomer.set(address.customer_id, bucket);
  }

  const ordersByCustomer = new Map<string, LightPostgresCustomerOrderRow[]>();
  for (const order of orders) {
    if (!order.customer_id) continue;
    const bucket = ordersByCustomer.get(order.customer_id) ?? [];
    bucket.push({
      ...order,
      total: normalizeNumber(order.total),
    });
    ordersByCustomer.set(order.customer_id, bucket);
  }

  return rows.map((row) => ({
    ...row,
    total_orders: normalizeNumber(row.total_orders),
    total_spent: normalizeNumber(row.total_spent),
    accepts_email_marketing: normalizeBoolean(row.accepts_email_marketing),
    accepts_sms_marketing: normalizeBoolean(row.accepts_sms_marketing),
    tax_exempt: normalizeBoolean(row.tax_exempt),
    is_active: normalizeBoolean(row.is_active),
    tags: normalizeTagList(row.tags),
    addresses: addressesByCustomer.get(row.id) ?? [],
    orders: ordersByCustomer.get(row.id) ?? [],
  }));
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

  return payload;
}

function normalizeAddressType(input: CustomerAddressInput) {
  if (input.type) {
    return input.type;
  }

  const title = (input.title || "").trim().toLowerCase();
  if (title.includes("fatura") || title.includes("billing")) {
    return "billing";
  }

  return "shipping";
}

function buildAddressRow(customerId: string, address: CustomerAddressInput, index: number) {
  return {
    customer_id: customerId,
    type: normalizeAddressType(address),
    company: address.company || null,
    first_name: address.firstName ?? address.first_name ?? null,
    last_name: address.lastName ?? address.last_name ?? null,
    address_line1: address.addressLine ?? address.addressLine1 ?? address.address_line1 ?? null,
    address_line2: address.addressLine2 ?? address.address_line2 ?? null,
    city: address.city || null,
    state: address.state ?? address.district ?? null,
    postal_code: address.postalCode ?? address.postal_code ?? null,
    country: address.country || "TR",
    phone: address.phone || null,
    is_default: address.isDefault ?? address.is_default ?? index === 0,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }

  return String(error || "");
}

function isMissingSchemaError(error: unknown): boolean {
  const message = toErrorMessage(error).toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("column")
  );
}

async function runOptionalCustomerCleanup(
  action: () => PromiseLike<{ error: unknown }>,
) {
  const { error } = await action();

  if (error && !isMissingSchemaError(error)) {
    throw error;
  }
}

// =====================================================
// CUSTOMER QUERIES & MUTATIONS
// =====================================================

/**
 * Get all customers (admin)
 */
export async function getCustomers(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}) {
  if (shouldUseLightPostgresAdmin()) {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (options?.search) {
      params.push(`%${options.search}%`);
      whereClauses.push(`(email ilike $${params.length} or first_name ilike $${params.length} or last_name ilike $${params.length})`);
    }

    let sql = `
      select
        id,
        email,
        user_id,
        first_name,
        last_name,
        phone,
        status,
        total_orders,
        total_spent,
        last_order_at,
        notes,
        tags,
        external_customer_id,
        accepts_email_marketing,
        accepts_sms_marketing,
        tax_exempt,
        is_active,
        created_at,
        updated_at
      from public.customers
    `;

    if (whereClauses.length > 0) {
      sql += ` where ${whereClauses.join(" and ")}`;
    }

    sql += " order by created_at desc";

    if (options?.limit) {
      params.push(options.limit);
      sql += ` limit $${params.length}`;
    }

    if (options?.offset) {
      params.push(options.offset);
      sql += ` offset $${params.length}`;
    }

    const rows = await queryAdminLightPostgres<LightPostgresCustomerRow>(sql, params);
    return hydrateLightPostgresCustomers(rows);
  }

  const serverClient = createServerClient();

  let query = serverClient
    .from("customers")
    .select(`
      *,
      addresses(*)
    `)
    .order("created_at", { ascending: false });

  if (options?.search) {
    query = query.or(
      `email.ilike.%${options.search}%,first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%`,
    );
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Get customer by ID (admin)
 */
export async function getCustomerById(id: string) {
  if (shouldUseLightPostgresAdmin()) {
    const row = await queryAdminLightPostgresOne<LightPostgresCustomerRow>(
      `
        select
          id,
          email,
          user_id,
          first_name,
          last_name,
          phone,
          status,
          total_orders,
          total_spent,
          last_order_at,
          notes,
          tags,
          external_customer_id,
          accepts_email_marketing,
          accepts_sms_marketing,
          tax_exempt,
          is_active,
          created_at,
          updated_at
        from public.customers
        where id = $1
        limit 1
      `,
      [id],
    );

    if (!row) {
      return null;
    }

    const [customer] = await hydrateLightPostgresCustomers([row]);
    return customer ?? null;
  }

  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("customers")
    .select(`
      *,
      addresses(*),
      orders(*)
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get customer by email
 */
export async function getCustomerByEmail(email: string) {
  if (shouldUseLightPostgresAdmin()) {
    const row = await queryAdminLightPostgresOne<LightPostgresCustomerRow>(
      `
        select
          id,
          email,
          user_id,
          first_name,
          last_name,
          phone,
          status,
          total_orders,
          total_spent,
          last_order_at,
          notes,
          tags,
          external_customer_id,
          accepts_email_marketing,
          accepts_sms_marketing,
          tax_exempt,
          is_active,
          created_at,
          updated_at
        from public.customers
        where lower(email) = lower($1)
        limit 1
      `,
      [email],
    );

    if (!row) {
      return null;
    }

    const [customer] = await hydrateLightPostgresCustomers([row]);
    return customer ?? null;
  }

  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("customers")
    .select(`
      *,
      addresses(*)
    `)
    .eq("email", email)
    .single();

  if (error) return null;
  return data;
}

/**
 * Create or get customer by email
 */
export async function getOrCreateCustomer(customerData: CustomerUpsertInput) {
  const serverClient = createServerClient();
  const existing = await getCustomerByEmail(customerData.email);
  const updates = buildCustomerUpdatePayload(customerData);

  if (existing) {
    if (Object.keys(updates).length > 0) {
      const { data: updated, error } = await serverClient
        .from("customers")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      if (!error) {
        return updated;
      }
    }

    return existing;
  }

  const { data, error } = await serverClient
    .from("customers")
    .insert({
      email: customerData.email,
      status: customerData.status || "active",
      ...updates,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update customer (admin)
 */
export async function updateCustomer(id: string, updates: Record<string, unknown>) {
  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Replace all customer addresses with the provided set.
 */
export async function replaceCustomerAddresses(customerId: string, addresses: CustomerAddressInput[]) {
  const serverClient = createServerClient();

  const { error: deleteError } = await serverClient
    .from("addresses")
    .delete()
    .eq("customer_id", customerId);

  if (deleteError) {
    throw deleteError;
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return [];
  }

  const rows = addresses.map((address, index) => buildAddressRow(customerId, address, index));
  const { data, error } = await serverClient.from("addresses").insert(rows).select();

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Delete customer (admin)
 */
export async function deleteCustomer(id: string) {
  const serverClient = createServerClient();

  // Keep historical records but detach them from the customer before delete.
  await runOptionalCustomerCleanup(() =>
    serverClient
      .from("orders")
      .update({ customer_id: null })
      .eq("customer_id", id),
  );

  await runOptionalCustomerCleanup(() =>
    serverClient
      .from("abandoned_carts")
      .update({ customer_id: null })
      .eq("customer_id", id),
  );

  await runOptionalCustomerCleanup(() =>
    serverClient
      .from("product_reviews")
      .update({ customer_id: null })
      .eq("customer_id", id),
  );

  await runOptionalCustomerCleanup(() =>
    serverClient
      .from("customer_preferred_products")
      .delete()
      .eq("customer_id", id),
  );

  await runOptionalCustomerCleanup(() =>
    serverClient
      .from("customer_addresses")
      .delete()
      .eq("customer_id", id),
  );

  const { error: addressesError } = await serverClient
    .from("addresses")
    .delete()
    .eq("customer_id", id);

  if (addressesError && !isMissingSchemaError(addressesError)) {
    throw addressesError;
  }

  const { error } = await serverClient
    .from("customers")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

/**
 * Increment customer order stats
 */
export async function incrementCustomerStats(customerId: string, orderTotal: number) {
  const serverClient = createServerClient();

  const { data: customer, error: fetchError } = await serverClient
    .from("customers")
    .select("total_orders, total_spent")
    .eq("id", customerId)
    .single();

  if (fetchError) throw fetchError;

  const { error: updateError } = await serverClient
    .from("customers")
    .update({
      total_orders: (customer.total_orders || 0) + 1,
      total_spent: (Number(customer.total_spent) || 0) + orderTotal,
    })
    .eq("id", customerId);

  if (updateError) throw updateError;
  return true;
}

// =====================================================
// ADDRESS OPERATIONS
// =====================================================

/**
 * Add address to customer
 */
export async function addAddress(address: Omit<Address, "id">) {
  const serverClient = createServerClient();

  if (address.is_default) {
    await serverClient
      .from("addresses")
      .update({ is_default: false })
      .eq("customer_id", address.customer_id)
      .eq("type", address.type);
  }

  const { data, error } = await serverClient
    .from("addresses")
    .insert(address)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update address
 */
export async function updateAddress(id: string, updates: Partial<Address>) {
  const serverClient = createServerClient();

  const { data, error } = await serverClient
    .from("addresses")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete address
 */
export async function deleteAddress(id: string) {
  const serverClient = createServerClient();

  const { error } = await serverClient
    .from("addresses")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return true;
}

/**
 * Get customer statistics (admin)
 */
export async function getCustomerStats() {
  if (shouldUseLightPostgresAdmin()) {
    const customers = await queryAdminLightPostgres<
      Pick<LightPostgresCustomerRow, "total_orders" | "total_spent" | "created_at">
    >(
      `
        select total_orders, total_spent, created_at
        from public.customers
      `,
    );

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newCustomers = customers.filter((customer) => new Date(customer.created_at) >= thisMonth);
    const totalRevenue = customers.reduce((sum, customer) => sum + normalizeNumber(customer.total_spent), 0);
    const totalOrders = customers.reduce((sum, customer) => sum + normalizeNumber(customer.total_orders), 0);

    return {
      totalCustomers: customers.length,
      newCustomersThisMonth: newCustomers.length,
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    };
  }

  const serverClient = createServerClient();

  const { data: customers, error } = await serverClient
    .from("customers")
    .select("total_orders, total_spent, created_at");

  if (error) throw error;

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newCustomers = customers.filter((customer) => new Date(customer.created_at) >= thisMonth);

  return {
    totalCustomers: customers.length,
    newCustomersThisMonth: newCustomers.length,
    totalRevenue: customers.reduce((sum, customer) => sum + Number(customer.total_spent), 0),
    averageOrderValue:
      customers.length > 0
        ? customers.reduce((sum, customer) => sum + Number(customer.total_spent), 0) /
            customers.reduce((sum, customer) => sum + customer.total_orders, 0) || 0
        : 0,
  };
}
