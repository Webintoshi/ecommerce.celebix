import { createServerClient } from "@/lib/supabase";
import { createOrder, getOrderBySourceRef } from "@/lib/db/orders";

export type QuickOrderLinkStatus = "active" | "opened" | "paid" | "cancelled" | "expired";

export type QuickOrderAddress = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  country?: string;
};

export type QuickOrderLinkItem = {
  id: string;
  quick_order_link_id: string;
  product_id: string | null;
  variant_id: string | null;
  position: number;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  image: string | null;
  sku: string | null;
  created_at: string;
};

export type QuickOrderLink = {
  id: string;
  token: string;
  status: QuickOrderLinkStatus;
  expires_at: string;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: QuickOrderAddress;
  billing_address: QuickOrderAddress;
  currency: string;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  note: string | null;
  allowed_payment_method_ids: string[];
  opened_at: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  items: QuickOrderLinkItem[];
};

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toAddress(value: unknown): QuickOrderAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    firstName: typeof record.firstName === "string" ? record.firstName : undefined,
    lastName: typeof record.lastName === "string" ? record.lastName : undefined,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    address: typeof record.address === "string" ? record.address : undefined,
    city: typeof record.city === "string" ? record.city : undefined,
    district: typeof record.district === "string" ? record.district : undefined,
    postalCode: typeof record.postalCode === "string" ? record.postalCode : undefined,
    country: typeof record.country === "string" ? record.country : undefined,
  };
}

function normalizeItem(row: Record<string, unknown>): QuickOrderLinkItem {
  return {
    id: String(row.id),
    quick_order_link_id: String(row.quick_order_link_id),
    product_id: typeof row.product_id === "string" ? row.product_id : null,
    variant_id: typeof row.variant_id === "string" ? row.variant_id : null,
    position: toNumber(row.position),
    product_name: String(row.product_name || ""),
    variant_name: typeof row.variant_name === "string" ? row.variant_name : null,
    quantity: toNumber(row.quantity),
    unit_price: toNumber(row.unit_price),
    line_total: toNumber(row.line_total),
    image: typeof row.image === "string" ? row.image : null,
    sku: typeof row.sku === "string" ? row.sku : null,
    created_at: String(row.created_at || ""),
  };
}

function normalizeLink(row: Record<string, unknown>): QuickOrderLink {
  return {
    id: String(row.id),
    token: String(row.token),
    status: (row.status as QuickOrderLinkStatus) || "active",
    expires_at: String(row.expires_at || ""),
    customer_email: String(row.customer_email || ""),
    customer_name: typeof row.customer_name === "string" ? row.customer_name : null,
    customer_phone: typeof row.customer_phone === "string" ? row.customer_phone : null,
    shipping_address: toAddress(row.shipping_address),
    billing_address: toAddress(row.billing_address),
    currency: typeof row.currency === "string" ? row.currency : "TRY",
    subtotal: toNumber(row.subtotal),
    shipping_cost: toNumber(row.shipping_cost),
    discount: toNumber(row.discount),
    total: toNumber(row.total),
    note: typeof row.note === "string" ? row.note : null,
    allowed_payment_method_ids: Array.isArray(row.allowed_payment_method_ids)
      ? row.allowed_payment_method_ids.filter((value): value is string => typeof value === "string")
      : [],
    opened_at: typeof row.opened_at === "string" ? row.opened_at : null,
    converted_at: typeof row.converted_at === "string" ? row.converted_at : null,
    cancelled_at: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    order_id: typeof row.order_id === "string" ? row.order_id : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
    items: Array.isArray(row.items)
      ? row.items.map((item) => normalizeItem(item as Record<string, unknown>)).sort((left, right) => left.position - right.position)
      : [],
  };
}

async function expireDueQuickOrderLinks() {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  await supabase
    .from("quick_order_links")
    .update({ status: "expired" })
    .in("status", ["active", "opened"])
    .lt("expires_at", nowIso);
}

export async function getQuickOrderLinkByToken(token: string) {
  await expireDueQuickOrderLinks();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("quick_order_links")
    .select("*, items:quick_order_link_items(*)")
    .eq("token", token)
    .single();

  if (error) {
    throw error;
  }

  return normalizeLink(data as Record<string, unknown>);
}

export async function getQuickOrderLinkById(id: string) {
  await expireDueQuickOrderLinks();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("quick_order_links")
    .select("*, items:quick_order_link_items(*)")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return normalizeLink(data as Record<string, unknown>);
}

export async function markQuickOrderLinkOpened(id: string) {
  const supabase = createServerClient();
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from("quick_order_links")
    .update({
      status: "opened",
      opened_at: timestamp,
    })
    .eq("id", id)
    .eq("status", "active")
    .select("*, items:quick_order_link_items(*)")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return getQuickOrderLinkById(id);
    }

    throw error;
  }

  return normalizeLink(data as Record<string, unknown>);
}

export async function settleQuickOrderLinkFailure(id: string) {
  const supabase = createServerClient();
  await supabase
    .from("quick_order_links")
    .update({
      status: "opened",
    })
    .eq("id", id)
    .in("status", ["active", "opened"]);
}

export async function markQuickOrderLinkPaid(id: string, orderId: string) {
  const supabase = createServerClient();
  const timestamp = new Date().toISOString();

  const { data, error } = await supabase
    .from("quick_order_links")
    .update({
      status: "paid",
      converted_at: timestamp,
      order_id: orderId,
    })
    .eq("id", id)
    .select("*, items:quick_order_link_items(*)")
    .single();

  if (error) {
    throw error;
  }

  return normalizeLink(data as Record<string, unknown>);
}

export async function validateQuickOrderStock(link: QuickOrderLink) {
  const variantIds = link.items
    .map((item) => item.variant_id)
    .filter((value): value is string => Boolean(value));

  if (variantIds.length === 0) {
    return;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, stock, product_id")
    .in("id", variantIds);

  if (error) {
    throw error;
  }

  const byId = new Map(
    (data || []).map((row) => [String(row.id), { stock: toNumber(row.stock), productId: typeof row.product_id === "string" ? row.product_id : null }]),
  );

  for (const item of link.items) {
    if (!item.variant_id) {
      continue;
    }

    const variant = byId.get(item.variant_id);
    if (!variant) {
      throw new Error(`${item.product_name} varyanti bulunamadi.`);
    }

    if (variant.stock < item.quantity) {
      throw new Error(`${item.product_name} icin yeterli stok kalmadi.`);
    }
  }
}

export async function materializeOrderFromQuickOrderLink(linkId: string, paymentMethod: string) {
  const link = await getQuickOrderLinkById(linkId);

  if (link.order_id) {
    return getOrderBySourceRef("quick_order_link", link.id);
  }

  try {
    const order = await createOrder({
      items: link.items.map((item) => ({
        productId: item.product_id || "",
        variantId: item.variant_id || "",
        productName: item.product_name,
        variantName: item.variant_name || "",
        price: item.unit_price,
        quantity: item.quantity,
      })),
      shippingAddress: link.shipping_address,
      billingAddress: link.billing_address,
      paymentMethod,
      shippingCost: link.shipping_cost,
      discount: link.discount,
      notes: link.note || undefined,
      contactEmail: link.customer_email,
      saveAddress: false,
      sourceType: "quick_order_link",
      sourceRefId: link.id,
    });

    await markQuickOrderLinkPaid(link.id, order.id);
    return order;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const duplicateSource = message.includes("idx_orders_source_type_ref")
      || message.includes("duplicate key value violates unique constraint");

    if (!duplicateSource) {
      throw error;
    }

    const existingOrder = await getOrderBySourceRef("quick_order_link", link.id);
    await markQuickOrderLinkPaid(link.id, String(existingOrder.id));
    return existingOrder;
  }
}
