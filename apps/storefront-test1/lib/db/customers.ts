import { createServerClient, Customer, Address } from "@/lib/supabase";

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
        query = query.or(`email.ilike.%${options.search}%,first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%`);
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

    if (error) return null; // Customer may not exist
    return data;
}

/**
 * Create or get customer by email
 */
export async function getOrCreateCustomer(customerData: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
}) {
    const serverClient = createServerClient();

    // Check if customer exists
    const existing = await getCustomerByEmail(customerData.email);
    if (existing) {
        // Update customer info if provided
        const updates: any = {};
        if (customerData.phone && !existing.phone) updates.phone = customerData.phone;
        if (customerData.firstName && !existing.first_name) updates.first_name = customerData.firstName;
        if (customerData.lastName && !existing.last_name) updates.last_name = customerData.lastName;
        
        if (Object.keys(updates).length > 0) {
            const { data: updated, error } = await serverClient
                .from("customers")
                .update(updates)
                .eq("id", existing.id)
                .select()
                .single();
            if (!error) return updated;
        }
        return existing;
    }

    // Create new customer
    const { data, error } = await serverClient
        .from("customers")
        .insert({
            email: customerData.email,
            phone: customerData.phone || null,
            first_name: customerData.firstName || null,
            last_name: customerData.lastName || null,
            status: 'active',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update customer (admin)
 */
export async function updateCustomer(id: string, updates: Partial<Customer>) {
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

    // If this is default address, unset other defaults
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

    const newCustomers = customers.filter(c => new Date(c.created_at) >= thisMonth);

    return {
        totalCustomers: customers.length,
        newCustomersThisMonth: newCustomers.length,
        totalRevenue: customers.reduce((sum, c) => sum + Number(c.total_spent), 0),
        averageOrderValue: customers.length > 0
            ? customers.reduce((sum, c) => sum + Number(c.total_spent), 0) / customers.reduce((sum, c) => sum + c.total_orders, 0) || 0
            : 0,
    };
}
