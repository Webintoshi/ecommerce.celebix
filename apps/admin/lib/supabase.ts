import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  getSupabaseAnonKey,
  getSupabaseServerUrl,
  getSupabaseServiceRoleKey,
  getSupabaseUrl
} from "@/lib/supabase-shared";

// Lazy browser client proxy so existing imports keep working.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getBrowserSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client as any)[prop as string];
  },
});

// Service role client for trusted server-side admin/database operations.
export function createServerClient() {
  return createClient(getSupabaseServerUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Fallback anon server client for rare cases where service role is not desired.
export function createAnonServerClient() {
  return createClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function uuid() {
  return crypto.randomUUID();
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[];
  category: string | null;
  tags: string[];
  is_featured: boolean;
  is_bestseller: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parent_id: string | null;
  sort_order: number;
}

export interface Customer {
  id: string;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
  external_customer_id: string | null;
  accepts_email_marketing: boolean | null;
  accepts_sms_marketing: boolean | null;
  tax_exempt: boolean | null;
  tags: string[] | null;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  customer_id: string;
  type: string;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  phone: string | null;
  is_default: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string | null;
  status: string;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  shipping_address: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  price: number;
  quantity: number;
  total: number;
}

export interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface Setting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  featured_image: string | null;
  author: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
}

export interface AbandonedCart {
  id: string;
  session_id: string | null;
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  is_anonymous: boolean;
  items: Record<string, unknown>[];
  total: number;
  item_count: number;
  status: string;
  recovered: boolean;
  recovered_at: string | null;
  updated_at: string;
  created_at: string;
}
