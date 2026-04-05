import { createServerClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import type { OrderActivityLog as OrderActivityLogType, OrderStatus } from "@/types/order";
import type { OrderItemCustomization } from "@/types/product-customization";
import { normalizeStoredCustomizations } from "@/lib/customization/normalize";
import { getOrderAccountingSnapshot } from "@/lib/db/accounting";
import type { AccountingOrderSnapshot } from "@/types/accounting";

// Client Components
import { OrderDetailClient } from "./OrderDetailClient";

interface PageProps {
    params: Promise<{ id: string }>;
}

type PaymentGateway = {
    id: string;
    name: string;
    gateway: string;
};
type DbActivityLogRow = {
    id: string;
    order_id?: string;
    action: OrderActivityLogType["action"];
    old_value?: unknown;
    new_value?: unknown;
    admin_id?: string;
    admin_name?: string;
    created_at?: string;
};

type RecentCustomerOrder = {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
};

// Helper function to get status badge config
function getStatusConfig(status: OrderStatus) {
    const configs: Record<OrderStatus, { label: string; color: string }> = {
        pending: { label: "Beklemede", color: "bg-yellow-50 text-yellow-700 border-yellow-100" },
        confirmed: { label: "Onaylandı", color: "bg-blue-50 text-blue-700 border-blue-100" },
        preparing: { label: "Hazırlanıyor", color: "bg-purple-50 text-purple-700 border-purple-100" },
        shipped: { label: "Kargolandı", color: "bg-indigo-50 text-indigo-700 border-indigo-100" },
        delivered: { label: "Teslim Edildi", color: "bg-green-50 text-green-700 border-green-100" },
        cancelled: { label: "İptal", color: "bg-red-50 text-red-700 border-red-100" },
        refunded: { label: "İade", color: "bg-orange-50 text-orange-700 border-orange-100" },
    };
    return configs[status] || configs.pending;
}

export default async function OrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = createServerClient();

    // Fetch order first
    const orderResponse = await supabase.from("orders").select("*").eq("id", id).single();

    if (orderResponse.error || !orderResponse.data) {
        console.error("Error fetching admin order:", orderResponse.error);
        notFound();
    }

    const order = orderResponse.data;

    // Fetch other data after order is confirmed
    const [itemsResponse, settingsResponse, activityLogResponse] = await Promise.all([
        supabase
            .from("order_items")
            .select("*, product:products(id, images, category, slug), customizations:order_item_customizations(*)")
            .eq("order_id", id),
        supabase.from("settings").select("value").eq("key", "payment_gateways").single(),
        // Fetch activity log with error handling - table might not exist yet
        (async () => {
            try {
                return await supabase
                    .from("order_activity_log")
                    .select("*")
                    .eq("order_id", id)
                    .order("created_at", { ascending: false });
            } catch (e) {
                console.log("Activity log table not yet available:", e);
                return { data: [], error: null };
            }
        })(),
    ]);

    let accountingSnapshot: AccountingOrderSnapshot | null = null;
    try {
        accountingSnapshot = await getOrderAccountingSnapshot(id);
    } catch (accountingError) {
        console.error("Order accounting snapshot error:", accountingError);
    }

    const items = itemsResponse.data || [];
    const paymentGateways = settingsResponse.data?.value ?? [];
    const activityLogRows = (activityLogResponse?.data ?? []) as DbActivityLogRow[];

    // Get customer data
    let customer = null;
    let customerOrders: RecentCustomerOrder[] = [];
    if (order.customer_id) {
        const [customerResponse, ordersResponse] = await Promise.all([
            supabase.from("customers").select("*").eq("id", order.customer_id).single(),
            supabase
                .from("orders")
                .select("id, order_number, status, total, created_at")
                .eq("customer_id", order.customer_id)
                .neq("id", id)
                .order("created_at", { ascending: false })
                .limit(5),
        ]);
        customer = customerResponse.data;
        customerOrders = ordersResponse.data || [];
    }

    // Determine Payment Method Name
    const gatewayConfig = (paymentGateways as PaymentGateway[]).find(
        (g) => g.id === order.payment_method
    );
    const paymentMethodName = gatewayConfig
        ? gatewayConfig.name
        : order.payment_method === "cod"
          ? "Kapıda Ödeme"
          : order.payment_method === "bank_transfer"
            ? "Havale / EFT"
            : "Kredi Kartı";

    const statusConfig = getStatusConfig(order.status);

    // Serialize data for client component - keep dates as ISO strings or null
    const serializedOrder = {
        ...order,
        created_at: order.created_at ? new Date(order.created_at).toISOString() : null,
        updated_at: order.updated_at ? new Date(order.updated_at).toISOString() : null,
        estimated_delivery: order.estimated_delivery ? new Date(order.estimated_delivery).toISOString() : null,
    };

    const serializedItems = items.map((item) => ({
        ...item,
        product: item.product || null, // Ensure product is null if deleted
        customizations: normalizeStoredCustomizations(item.customizations),
        created_at: item.created_at?.toString(),
    }));

    const serializedActivityLogs: OrderActivityLogType[] = activityLogRows.map((log) => ({
        id: log.id,
        orderId: log.order_id || id,
        action: log.action,
        oldValue: log.old_value,
        newValue: log.new_value,
        adminId: log.admin_id,
        adminName: log.admin_name || "Admin",
        createdAt: log.created_at ? new Date(log.created_at) : new Date(),
    }));

    const serializedCustomerOrders = customerOrders.map((o) => ({
        ...o,
        created_at: o.created_at?.toString(),
    }));

    return (
        <OrderDetailClient
            order={serializedOrder}
            items={serializedItems}
            activityLogs={serializedActivityLogs}
            customer={customer}
            customerOrders={serializedCustomerOrders}
            paymentMethodName={paymentMethodName}
            statusConfig={statusConfig}
            accountingSnapshot={accountingSnapshot}
        />
    );
}
