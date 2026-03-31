import { createServerClient, type Address } from "@/lib/supabase";

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
