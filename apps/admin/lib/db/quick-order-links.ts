import crypto from "node:crypto";
import { createServerClient } from "@/lib/supabase";

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

export type QuickOrderLinkItemInput = {
  productId?: string | null;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  image?: string | null;
  sku?: string | null;
};

export type CreateQuickOrderLinkInput = {
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  shippingAddress: QuickOrderAddress;
  billingAddress: QuickOrderAddress;
  currency?: string;
  shippingCost?: number;
  discount?: number;
  note?: string | null;
  allowedPaymentMethodIds: string[];
  expiresAt: string;
  items: QuickOrderLinkItemInput[];
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

function generateQuickOrderToken() {
  return crypto.randomBytes(24).toString("hex");
}

function calculateTotals(items: QuickOrderLinkItemInput[], shippingCost: number, discount: number) {
  const normalizedItems = items.map((item, index) => {
    const quantity = Math.max(1, Math.trunc(item.quantity || 1));
    const unitPrice = Math.max(0, toNumber(item.unitPrice));
    const lineTotal = typeof item.lineTotal === "number"
      ? Math.max(0, item.lineTotal)
      : Number((quantity * unitPrice).toFixed(2));

    return {
      ...item,
      quantity,
      unitPrice,
      lineTotal,
      position: index,
    };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Math.max(0, subtotal + shippingCost - discount);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(total.toFixed(2)),
    normalizedItems,
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

export async function listQuickOrderLinks() {
  await expireDueQuickOrderLinks();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("quick_order_links")
    .select("*, items:quick_order_link_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => normalizeLink(row as Record<string, unknown>));
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

export async function createQuickOrderLink(input: CreateQuickOrderLinkInput) {
  const supabase = createServerClient();
  const shippingCost = Math.max(0, toNumber(input.shippingCost));
  const discount = Math.max(0, toNumber(input.discount));
  const { subtotal, total, normalizedItems } = calculateTotals(input.items, shippingCost, discount);
  const token = generateQuickOrderToken();

  const { data: linkRow, error: linkError } = await supabase
    .from("quick_order_links")
    .insert({
      token,
      status: "active",
      expires_at: input.expiresAt,
      customer_email: input.customerEmail,
      customer_name: input.customerName || null,
      customer_phone: input.customerPhone || null,
      shipping_address: input.shippingAddress,
      billing_address: input.billingAddress,
      currency: input.currency || "TRY",
      subtotal,
      shipping_cost: shippingCost,
      discount,
      total,
      note: input.note || null,
      allowed_payment_method_ids: input.allowedPaymentMethodIds,
    })
    .select("*")
    .single();

  if (linkError) {
    throw linkError;
  }

  const { error: itemsError } = await supabase
    .from("quick_order_link_items")
    .insert(
      normalizedItems.map((item) => ({
        quick_order_link_id: linkRow.id,
        product_id: item.productId || null,
        variant_id: item.variantId || null,
        position: item.position,
        product_name: item.productName,
        variant_name: item.variantName || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        image: item.image || null,
        sku: item.sku || null,
      })),
    );

  if (itemsError) {
    throw itemsError;
  }

  return getQuickOrderLinkById(String(linkRow.id));
}

export async function cancelQuickOrderLink(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("quick_order_links")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("order_id", null)
    .in("status", ["active", "opened", "expired"])
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeLink({
    ...(data as Record<string, unknown>),
    items: [],
  });
}

export async function duplicateQuickOrderLink(id: string) {
  const original = await getQuickOrderLinkById(id);
  const now = Date.now();
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  return createQuickOrderLink({
    customerEmail: original.customer_email,
    customerName: original.customer_name,
    customerPhone: original.customer_phone,
    shippingAddress: original.shipping_address,
    billingAddress: original.billing_address,
    currency: original.currency,
    shippingCost: original.shipping_cost,
    discount: original.discount,
    note: original.note,
    allowedPaymentMethodIds: original.allowed_payment_method_ids,
    expiresAt,
    items: original.items.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      productName: item.product_name,
      variantName: item.variant_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
      image: item.image,
      sku: item.sku,
    })),
  });
}
