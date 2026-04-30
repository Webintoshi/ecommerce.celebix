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

type MarketplaceOrderSourceRow = {
    provider?: string | null;
    external_order_id?: string | null;
    order_status?: string | null;
    import_status?: string | null;
    normalized_payload?: Record<string, unknown> | null;
    updated_at?: string | null;
    created_at?: string | null;
};

type OrderWithMarketplaceSources = OrderWithItems & {
    marketplace_orders?: MarketplaceOrderSourceRow[] | MarketplaceOrderSourceRow | null;
};

const ORDER_SELECT = `
      *,
      items:order_items(
        *,
        customizations:order_item_customizations(*)
      )
    `;

const ORDER_SELECT_WITH_MARKETPLACE = `
      *,
      items:order_items(
        *,
        customizations:order_item_customizations(*)
      ),
      marketplace_orders(
        provider,
        external_order_id,
        order_status,
        import_status,
        normalized_payload,
        updated_at,
        created_at
      )
    `;

const MARKETPLACE_ORDER_SOURCE_META = {
    trendyol: {
        providerLabel: "Trendyol",
        logoPath: "/marketplace-logos/trendyol.png",
    },
    hepsiburada: {
        providerLabel: "Hepsiburada",
        logoPath: "/marketplace-logos/hepsiburada.png",
    },
    n11: {
        providerLabel: "n11",
        logoPath: "/marketplace-logos/n11.png",
    },
    amazon_tr: {
        providerLabel: "Amazon TR",
        logoPath: "/marketplace-logos/amazon-tr.png",
    },
} as const;

function normalizeMarketplaceOrdersRelation(
    relation: OrderWithMarketplaceSources["marketplace_orders"]
) {
    if (!relation) return [];
    return Array.isArray(relation) ? relation : [relation];
}

function getMarketplaceExternalOrderNumber(row: MarketplaceOrderSourceRow) {
    const payload = row.normalized_payload || {};
    const candidates = [
        payload.orderNumber,
        payload.order_number,
        payload.packageNumber,
        payload.package_number,
        payload.orderId,
        payload.order_id,
        row.external_order_id,
    ];

    return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function buildMarketplaceSource(order: OrderWithMarketplaceSources) {
    const linkedMarketplaceOrder = normalizeMarketplaceOrdersRelation(order.marketplace_orders)
        .find((row) => row.provider && row.provider in MARKETPLACE_ORDER_SOURCE_META);

    if (!linkedMarketplaceOrder?.provider || !linkedMarketplaceOrder.external_order_id) {
        return null;
    }

    const meta =
        MARKETPLACE_ORDER_SOURCE_META[
            linkedMarketplaceOrder.provider as keyof typeof MARKETPLACE_ORDER_SOURCE_META
        ];

    return {
        provider: linkedMarketplaceOrder.provider,
        providerLabel: meta.providerLabel,
        logoPath: meta.logoPath,
        externalOrderId: linkedMarketplaceOrder.external_order_id,
        externalOrderNumber: getMarketplaceExternalOrderNumber(linkedMarketplaceOrder),
        marketplaceStatus: linkedMarketplaceOrder.order_status || null,
        importStatus: linkedMarketplaceOrder.import_status || null,
        updatedAt: linkedMarketplaceOrder.updated_at || linkedMarketplaceOrder.created_at || null,
    };
}

function normalizeOrderRow(order: Record<string, unknown>) {
    const typedOrder = order as OrderWithMarketplaceSources;
    const publicOrder = { ...order };
    delete publicOrder.marketplace_orders;

    return {
        ...publicOrder,
        marketplaceSource: buildMarketplaceSource(typedOrder),
        items: (typedOrder.items || []).map((item) => {
            const typedItem = item as OrderItemWithCustomizations;
            return {
                ...item,
                customizations: normalizeStoredCustomizations(typedItem.customizations),
            };
        }),
    };
}

function isMarketplaceRelationError(error: unknown) {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string } | null;
    const text = [
        maybeError?.message,
        maybeError?.details,
        maybeError?.hint,
        maybeError?.code,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return text.includes("marketplace_orders");
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
            body: `${orderItems.length} kalem iceren yeni siparis oluştu.`,
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
    const serverClient = createServerClient();

    const buildQuery = (selectClause: string) => {
        let query = serverClient
            .from("orders")
            .select(selectClause)
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

        return query;
    };

    let { data, error } = await buildQuery(ORDER_SELECT_WITH_MARKETPLACE);

    if (error && isMarketplaceRelationError(error)) {
        const fallback = await buildQuery(ORDER_SELECT);
        data = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;
    const orders = (data || []) as unknown as Record<string, unknown>[];
    return orders.map((order) => normalizeOrderRow(order));
}

/**
 * Get order by ID (admin)
 */
export async function getOrderById(id: string) {
    const serverClient = createServerClient();

    const buildQuery = (selectClause: string) =>
        serverClient
            .from("orders")
            .select(selectClause)
            .eq("id", id)
            .single();

    let { data, error } = await buildQuery(ORDER_SELECT_WITH_MARKETPLACE);

    if (error && isMarketplaceRelationError(error)) {
        const fallback = await buildQuery(ORDER_SELECT);
        data = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;
    return normalizeOrderRow(data as unknown as Record<string, unknown>);
}

/**
 * Get order by order number
 */
export async function getOrderByNumber(orderNumber: string) {
    const serverClient = createServerClient();

    const buildQuery = (selectClause: string) =>
        serverClient
            .from("orders")
            .select(selectClause)
            .eq("order_number", orderNumber)
            .single();

    let { data, error } = await buildQuery(ORDER_SELECT_WITH_MARKETPLACE);

    if (error && isMarketplaceRelationError(error)) {
        const fallback = await buildQuery(ORDER_SELECT);
        data = fallback.data;
        error = fallback.error;
    }

    if (error) throw error;
    return normalizeOrderRow(data as unknown as Record<string, unknown>);
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
