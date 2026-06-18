import { createServerClient } from "@/lib/supabase";
import { markAbandonedCartAsRecovered } from "./abandoned-carts";
import { getOrCreateCustomer } from "./customers";
import { incrementCouponUsage } from "./coupons";
import { enqueueAndProcessInvoiceForOrder } from "./accounting";
import { enqueueInventorySyncByVariantIds, enqueueOrderStatusSync } from "./marketplace-sync";
import { attemptOrderShippingDispatch } from "./shipping-automation";
import { emitAdminNotificationEvent } from "@/lib/admin-notification-center";
import { CartCustomizationPayload, OrderItemCustomization } from "@/types/product-customization";
import { normalizeStoredCustomizations } from "@/lib/customization/normalize";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { queryAdminLightPostgres, queryAdminLightPostgresOne } from "@/lib/db/light-postgres-client";

type ShippingAddressInput = {
    firstName?: string;
    lastName?: string;
    phone?: string;
    address?: string;
    city?: string;
    district?: string;
    postalCode?: string;
};

type OrderItemWithCustomizations = {
    customizations?: unknown;
} & Record<string, unknown>;

type OrderWithItems = {
    items?: OrderItemWithCustomizations[];
} & Record<string, unknown>;

type LightPostgresOrderRow = Record<string, unknown> & {
    id: string;
    order_number: string;
    customer_id: string | null;
    status: string;
    subtotal: number | string;
    shipping_cost: number | string;
    discount: number | string;
    total: number | string;
    shipping_address: unknown;
    billing_address: unknown;
    payment_method: string | null;
    payment_status: string;
    notes: string | null;
    source_type: string | null;
    source_ref_id: string | null;
    shipping_carrier: string | null;
    tracking_number: string | null;
    estimated_delivery: string | null;
    internal_notes: string | null;
    created_at: string;
    updated_at: string;
};

type LightPostgresOrderItemRow = Record<string, unknown> & {
    id: string;
    order_id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    product_image: string | null;
    price: number | string;
    quantity: number | string;
    total: number | string;
    created_at: string;
};

type LightPostgresOrderItemCustomizationRow = Record<string, unknown> & {
    order_item_id: string;
};

let lightPostgresOrderColumnsPromise: Promise<Set<string>> | null = null;

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function getLightPostgresOrderColumns(): Promise<Set<string>> {
    if (!lightPostgresOrderColumnsPromise) {
        lightPostgresOrderColumnsPromise = queryAdminLightPostgres<{ column_name: string }>(
            `
              select column_name
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'orders'
            `,
        ).then((rows) => new Set(rows.map((row) => row.column_name)));
    }

    return lightPostgresOrderColumnsPromise;
}

function selectLightPostgresOrderColumn(
    columns: Set<string>,
    columnName: string,
    fallbackSql = "null",
): string {
    return columns.has(columnName)
        ? columnName
        : `${fallbackSql} as ${columnName}`;
}

async function listLightPostgresOrders(options?: {
    status?: string;
    limit?: number;
    offset?: number;
}) {
    const orderColumns = await getLightPostgresOrderColumns();
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (options?.status) {
        params.push(options.status);
        whereClauses.push(`status = $${params.length}`);
    }

    let sql = `
        select
          id,
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
          source_ref_id,
          ${selectLightPostgresOrderColumn(orderColumns, "shipping_carrier")},
          ${selectLightPostgresOrderColumn(orderColumns, "tracking_number")},
          ${selectLightPostgresOrderColumn(orderColumns, "estimated_delivery")},
          ${selectLightPostgresOrderColumn(orderColumns, "internal_notes")},
          created_at,
          updated_at
        from public.orders
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

    const orders = await queryAdminLightPostgres<LightPostgresOrderRow>(sql, params);
    return hydrateLightPostgresOrders(orders);
}

async function hydrateLightPostgresOrders(orders: LightPostgresOrderRow[]) {
    if (orders.length === 0) {
        return [];
    }

    const orderIds = orders.map((order) => order.id);
    const items = await queryAdminLightPostgres<LightPostgresOrderItemRow>(
        `
          select
            id,
            order_id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            product_image,
            price,
            quantity,
            total,
            created_at
          from public.order_items
          where order_id = any($1::uuid[])
          order by created_at asc
        `,
        [orderIds],
    );

    const itemIds = items.map((item) => item.id);
    const customizations = itemIds.length > 0
        ? await queryAdminLightPostgres<LightPostgresOrderItemCustomizationRow>(
            `
              select *
              from public.order_item_customizations
              where order_item_id = any($1::uuid[])
              order by created_at asc
            `,
            [itemIds],
        )
        : [];

    const customizationsByItem = new Map<string, LightPostgresOrderItemCustomizationRow[]>();
    for (const customization of customizations) {
        const bucket = customizationsByItem.get(customization.order_item_id) ?? [];
        bucket.push(customization);
        customizationsByItem.set(customization.order_item_id, bucket);
    }

    const itemsByOrder = new Map<string, OrderItemWithCustomizations[]>();
    for (const item of items) {
        const mappedItem: OrderItemWithCustomizations = {
            ...item,
            price: toNumber(item.price),
            quantity: toNumber(item.quantity),
            total: toNumber(item.total),
            customizations: customizationsByItem.get(item.id) ?? [],
        };
        const bucket = itemsByOrder.get(item.order_id) ?? [];
        bucket.push(mappedItem);
        itemsByOrder.set(item.order_id, bucket);
    }

    return orders.map((order) => ({
        ...order,
        subtotal: toNumber(order.subtotal),
        shipping_cost: toNumber(order.shipping_cost),
        discount: toNumber(order.discount),
        total: toNumber(order.total),
        items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
            ...item,
            customizations: normalizeStoredCustomizations(item.customizations),
        })),
    }));
}

// =====================================================
// ORDER MUTATIONS (Server-side only - all order operations require admin)
// =====================================================

/**
 * Generate unique order number
 */
function generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EZM-${timestamp}-${random}`;
}

function buildLegacyStepValues(customization: CartCustomizationPayload) {
    return customization.selections.reduce<Record<string, unknown>>((acc, selection) => {
        acc[selection.step_key] = selection.value;
        return acc;
    }, {});
}

async function insertOrderItemCustomization(
    serverClient: ReturnType<typeof createServerClient>,
    orderItemId: string,
    customization: CartCustomizationPayload
) {
    const modernPayload = {
        order_item_id: orderItemId,
        schema_id: customization.schema_id,
        schema_version: 1,
        schema_snapshot: customization.schema_snapshot,
        selections: customization.selections,
        price_breakdown: customization.price_breakdown,
        custom_text_content: customization.custom_text_content || null,
        uploaded_files: customization.uploaded_files || [],
        production_status: "pending",
    };

    const { error: modernError } = await serverClient
        .from("order_item_customizations")
        .insert(modernPayload);

    if (!modernError) return;

    const legacyPayload = {
        order_item_id: orderItemId,
        schema_snapshot_id: customization.schema_id,
        step_values: buildLegacyStepValues(customization),
        calculated_price: customization.price_breakdown?.total_adjustment || 0,
    };

    const { error: legacyError } = await serverClient
        .from("order_item_customizations")
        .insert(legacyPayload);

    if (legacyError) {
        throw legacyError;
    }
}

/**
 * Create a new order
 */
export async function createOrder(orderData: {
    customerId?: string;
    items: {
        productId: string;
        variantId: string;
        productName: string;
        variantName: string;
        price: number;
        quantity: number;
        category?: string;
        customization?: CartCustomizationPayload | null;
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
}) {
    const serverClient = createServerClient();
    const touchedVariantIds: string[] = [];

    // Calculate totals
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = orderData.shippingCost || 0;
    const discount = orderData.discount || 0;
    const total = subtotal + shippingCost - discount;
    const couponCode = orderData.couponCode?.trim().toUpperCase() || null;
    const notesWithCoupon = [orderData.notes?.trim(), couponCode ? `Kupon: ${couponCode}` : null]
        .filter(Boolean)
        .join(" | ") || null;

    // Get or create customer if email provided
    let customerId = orderData.customerId;
    if (!customerId && orderData.contactEmail) {
        const shipping = orderData.shippingAddress as ShippingAddressInput;
        const customer = await getOrCreateCustomer({
            email: orderData.contactEmail,
            phone: shipping?.phone,
            firstName: shipping?.firstName,
            lastName: shipping?.lastName,
        });
        customerId = customer.id;
    }

    // Create order
    const { data: order, error: orderError } = await serverClient
        .from("orders")
        .insert({
            order_number: generateOrderNumber(),
            customer_id: customerId || null,
            status: "pending",
            subtotal,
            shipping_cost: shippingCost,
            discount,
            total,
            shipping_address: orderData.shippingAddress,
            billing_address: orderData.billingAddress || orderData.shippingAddress,
            payment_method: orderData.paymentMethod,
            payment_status: "pending",
            notes: notesWithCoupon,
        })
        .select()
        .single();

    if (orderError) throw orderError;

    // Create order items with optional customization snapshots
    const orderItems: {
        id: string;
        order_id: string;
        product_id: string;
        variant_id: string;
        product_name: string;
        variant_name: string;
        price: number;
        quantity: number;
        total: number;
    }[] = [];

    for (const item of orderData.items) {
        const orderItemPayload = {
            order_id: order.id,
            product_id: item.productId,
            variant_id: item.variantId,
            product_name: item.productName,
            variant_name: item.variantName,
            price: item.price,
            quantity: item.quantity,
            total: item.price * item.quantity,
        };

        const { data: insertedItem, error: itemError } = await serverClient
            .from("order_items")
            .insert(orderItemPayload)
            .select()
            .single();

        if (itemError || !insertedItem) throw itemError;

        orderItems.push(insertedItem);

        if (item.customization) {
            await insertOrderItemCustomization(serverClient, insertedItem.id, item.customization);
        }
    }

    // Save address to customer_addresses
    if (customerId && orderData.saveAddress !== false) {
        const shipping = orderData.shippingAddress as ShippingAddressInput;
        
        // Check if address already exists
        const { data: existingAddresses } = await serverClient
            .from("customer_addresses")
            .select("*")
            .eq("customer_id", customerId)
            .limit(1);

        const isFirstAddress = !existingAddresses || existingAddresses.length === 0;

        // Insert new address
        await serverClient
            .from("customer_addresses")
            .insert({
                customer_id: customerId,
                title: "Varsayılan Adres",
                first_name: shipping.firstName || "",
                last_name: shipping.lastName || "",
                phone: shipping.phone || "",
                address: shipping.address || "",
                city: shipping.city || "",
                district: shipping.district || "",
                postal_code: shipping.postalCode || "",
                is_default: isFirstAddress,
            });
    }

    // Track customer preferred products
    if (customerId) {
        for (const item of orderData.items) {
            // Check if product already in preferences
            const { data: existingPref } = await serverClient
                .from("customer_preferred_products")
                .select("*")
                .eq("customer_id", customerId)
                .eq("product_id", item.productId)
                .eq("variant_id", item.variantId)
                .single();

            if (existingPref) {
                // Update existing preference
                await serverClient
                    .from("customer_preferred_products")
                    .update({
                        purchase_count: existingPref.purchase_count + 1,
                        total_quantity: existingPref.total_quantity + item.quantity,
                        total_spent: existingPref.total_spent + (item.price * item.quantity),
                        last_purchased_at: new Date().toISOString(),
                    })
                    .eq("id", existingPref.id);
            } else {
                // Insert new preference
                await serverClient
                    .from("customer_preferred_products")
                    .insert({
                        customer_id: customerId,
                        product_id: item.productId,
                        variant_id: item.variantId,
                        product_name: item.productName,
                        variant_name: item.variantName || "",
                        category: item.category || "",
                        purchase_count: 1,
                        total_quantity: item.quantity,
                        total_spent: item.price * item.quantity,
                        last_purchased_at: new Date().toISOString(),
                    });
            }
        }
    }

    // Reduce stock for each item
    for (const item of orderData.items) {
        // Get current stock
        const { data: variant } = await serverClient
            .from("product_variants")
            .select("stock")
            .eq("id", item.variantId)
            .single();

        if (variant) {
            const newStock = Math.max(0, variant.stock - item.quantity);
            await serverClient
                .from("product_variants")
                .update({ stock: newStock })
                .eq("id", item.variantId);
        }

        touchedVariantIds.push(item.variantId);

        // Update product sales count
        const { data: product } = await serverClient
            .from("products")
            .select("sales_count")
            .eq("id", item.productId)
            .single();

        if (product) {
            await serverClient
                .from("products")
                .update({ sales_count: (product.sales_count || 0) + item.quantity })
                .eq("id", item.productId);
        }
    }

    if (couponCode) {
        try {
            await incrementCouponUsage(couponCode);
        } catch (couponError) {
            console.error("Failed to increment coupon usage:", couponError);
        }
    }

    try {
        await enqueueInventorySyncByVariantIds(touchedVariantIds);
    } catch (marketplaceError) {
        console.error("Marketplace inventory queue error (createOrder):", marketplaceError);
    }

    try {
        await markAbandonedCartAsRecovered({
            sessionId: orderData.abandonedCartSessionId || null,
            customerId: customerId || null,
            email: orderData.contactEmail || null,
        }, serverClient);
    } catch (abandonedCartError) {
        console.error("Abandoned cart recovery sync error (createOrder):", abandonedCartError);
    }

    try {
        await emitAdminNotificationEvent({
            type: "new_order",
            title: `Yeni siparis #${order.order_number || "---"}`,
            body: `${orderItems.length} kalem iceren yeni siparis olustu.`,
            href: `/admin/siparisler/${order.id}`,
            entityType: "order",
            entityId: String(order.id),
            payload: {
                orderId: order.id,
                orderNumber: order.order_number || null,
                total,
                itemCount: orderItems.length,
            },
        });
    } catch (notificationError) {
        console.error("Admin notification error (createOrder):", notificationError);
    }

    return { ...order, items: orderItems };
}

/**
 * Get all orders (admin)
 */
export async function getOrders(options?: {
    status?: string;
    limit?: number;
    offset?: number;
}) {
    if (shouldUseLightPostgresAdmin()) {
        return listLightPostgresOrders(options);
    }

    const serverClient = createServerClient();

    let query = serverClient
        .from("orders")
        .select(`
      *,
      items:order_items(
        *,
        customizations:order_item_customizations(*)
      )
    `)
        .order("created_at", { ascending: false });

    if (options?.status) {
        query = query.eq("status", options.status);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map((order) => {
        const typedOrder = order as OrderWithItems;
        return {
            ...order,
            items: (typedOrder.items || []).map((item) => {
                const typedItem = item as OrderItemWithCustomizations;
                return {
                    ...item,
                    customizations: normalizeStoredCustomizations(typedItem.customizations),
                };
            }),
        };
    });
}

/**
 * Get order by ID (admin)
 */
export async function getOrderById(id: string) {
    if (shouldUseLightPostgresAdmin()) {
        const row = await queryAdminLightPostgresOne<LightPostgresOrderRow>(
            `
              select
                id,
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
                source_ref_id,
                shipping_carrier,
                tracking_number,
                estimated_delivery,
                internal_notes,
                created_at,
                updated_at
              from public.orders
              where id = $1
              limit 1
            `,
            [id],
        );

        if (!row) {
            return null;
        }

        const [order] = await hydrateLightPostgresOrders([row]);
        return order ?? null;
    }

    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("orders")
        .select(`
      *,
      items:order_items(
        *,
        customizations:order_item_customizations(*)
      )
    `)
        .eq("id", id)
        .single();

    if (error) throw error;
    const typedOrder = data as OrderWithItems;
    return {
        ...data,
        items: (typedOrder.items || []).map((item) => {
            const typedItem = item as OrderItemWithCustomizations;
            return {
                ...item,
                customizations: normalizeStoredCustomizations(typedItem.customizations),
            };
        }),
    };
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(orderNumber: string) {
    if (shouldUseLightPostgresAdmin()) {
        const row = await queryAdminLightPostgresOne<LightPostgresOrderRow>(
            `
              select
                id,
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
                source_ref_id,
                shipping_carrier,
                tracking_number,
                estimated_delivery,
                internal_notes,
                created_at,
                updated_at
              from public.orders
              where order_number = $1
              limit 1
            `,
            [orderNumber],
        );

        if (!row) {
            return null;
        }

        const [order] = await hydrateLightPostgresOrders([row]);
        return order ?? null;
    }

    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("orders")
        .select(`
      *,
      items:order_items(
        *,
        customizations:order_item_customizations(*)
      )
    `)
        .eq("order_number", orderNumber)
        .single();

    if (error) throw error;
    const typedOrder = data as OrderWithItems;
    return {
        ...data,
        items: (typedOrder.items || []).map((item) => {
            const typedItem = item as OrderItemWithCustomizations;
            return {
                ...item,
                customizations: normalizeStoredCustomizations(typedItem.customizations),
            };
        }),
    };
}

/**
 * Update order status (admin)
 */
export async function updateOrderStatus(id: string, status: string) {
    const serverClient = createServerClient();
    const touchedVariantIds: string[] = [];

    // Get current order status and items before updating
    await serverClient
        .from("orders")
        .select("status")
        .eq("id", id)
        .single();

    const { data: orderItems } = await serverClient
        .from("order_items")
        .select("variant_id, quantity")
        .eq("order_id", id);

    const { data, error } = await serverClient
        .from("orders")
        .update({ status })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    // If order is cancelled or failed, restore stock
    if ((status === "cancelled" || status === "failed") && orderItems) {
        for (const item of orderItems) {
            if (item.variant_id) {
                // Get current stock
                const { data: variant } = await serverClient
                    .from("product_variants")
                    .select("stock")
                    .eq("id", item.variant_id)
                    .single();

                if (variant) {
                    const newStock = variant.stock + item.quantity;
                    await serverClient
                        .from("product_variants")
                        .update({ stock: newStock })
                        .eq("id", item.variant_id);
                }

                touchedVariantIds.push(item.variant_id);
            }

            // Reduce sales count
            if (item.variant_id) {
                const { data: orderItem } = await serverClient
                    .from("order_items")
                    .select("product_id, quantity")
                    .eq("order_id", id)
                    .eq("variant_id", item.variant_id)
                    .single();

                if (orderItem?.product_id) {
                    const { data: product } = await serverClient
                        .from("products")
                        .select("sales_count")
                        .eq("id", orderItem.product_id)
                        .single();

                    if (product && product.sales_count > 0) {
                        await serverClient
                            .from("products")
                            .update({ sales_count: Math.max(0, product.sales_count - orderItem.quantity) })
                            .eq("id", orderItem.product_id);
                    }
                }
            }
        }
    }

    try {
        if (touchedVariantIds.length > 0) {
            await enqueueInventorySyncByVariantIds(touchedVariantIds);
        }
        await enqueueOrderStatusSync(id);
        if (status === "confirmed" || status === "preparing") {
            await attemptOrderShippingDispatch(id, status);
        }
    } catch (marketplaceError) {
        console.error("Order automation error (updateOrderStatus):", marketplaceError);
    }

    return data;
}

/**
 * Update payment status (admin)
 */
export async function updatePaymentStatus(id: string, paymentStatus: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("orders")
        .update({ payment_status: paymentStatus })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;

    if (paymentStatus === "completed") {
        try {
            await enqueueAndProcessInvoiceForOrder(id);
        } catch (accountingError) {
            console.error("Accounting queue error (updatePaymentStatus):", accountingError);
        }
    }

    try {
        await enqueueOrderStatusSync(id);
    } catch (marketplaceError) {
        console.error("Marketplace queue error (updatePaymentStatus):", marketplaceError);
    }

    if (paymentStatus === "failed") {
        try {
            await emitAdminNotificationEvent({
                type: "payment_failed",
                title: `Odeme hatasi #${data.order_number || "---"}`,
                body: "Siparis odemesi basarisiz oldu. Detayi kontrol edin.",
                href: `/admin/siparisler/${data.id}`,
                entityType: "order",
                entityId: String(data.id),
                payload: {
                    orderId: data.id,
                    orderNumber: data.order_number || null,
                    paymentStatus,
                },
            });
        } catch (notificationError) {
            console.error("Admin notification error (updatePaymentStatus):", notificationError);
        }
    }

    return data;
}

/**
 * Delete order (admin)
 */
export async function deleteOrder(id: string) {
    const serverClient = createServerClient();

    const { error } = await serverClient
        .from("orders")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}

/**
 * Get order statistics (admin)
 */
export async function getOrderStats() {
    if (shouldUseLightPostgresAdmin()) {
        const orders = await queryAdminLightPostgres<Pick<LightPostgresOrderRow, "total" | "status" | "created_at">>(
            `
              select total, status, created_at
              from public.orders
            `,
        );

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayOrders = orders.filter((order) => new Date(order.created_at) >= today);
        const monthOrders = orders.filter((order) => new Date(order.created_at) >= thisMonth);
        const pendingOrders = orders.filter((order) => order.status === "pending");

        return {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, order) => sum + toNumber(order.total), 0),
            todayOrders: todayOrders.length,
            todayRevenue: todayOrders.reduce((sum, order) => sum + toNumber(order.total), 0),
            monthOrders: monthOrders.length,
            monthRevenue: monthOrders.reduce((sum, order) => sum + toNumber(order.total), 0),
            pendingOrders: pendingOrders.length,
        };
    }

    const serverClient = createServerClient();

    const { data: orders, error } = await serverClient
        .from("orders")
        .select("total, status, created_at");

    if (error) throw error;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const monthOrders = orders.filter(o => new Date(o.created_at) >= thisMonth);
    const pendingOrders = orders.filter(o => o.status === "pending");

    return {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        todayOrders: todayOrders.length,
        todayRevenue: todayOrders.reduce((sum, o) => sum + Number(o.total), 0),
        monthOrders: monthOrders.length,
        monthRevenue: monthOrders.reduce((sum, o) => sum + Number(o.total), 0),
        pendingOrders: pendingOrders.length,
    };
}
