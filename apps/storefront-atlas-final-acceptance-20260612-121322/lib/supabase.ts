import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { isLightPostgresRuntime } from "@celebix/platform-config/src/light-postgres-runtime";

type LightPostgresCompatModule = {
    createLightPostgresCompatClient: (options: {
        env: NodeJS.ProcessEnv;
        mode: "light_postgres";
    }) => unknown;
};

function createLightPostgresServerCompatClient() {
    const runtimeRequire = (0, eval)("require") as (id: string) => unknown;
    const compatModule = runtimeRequire(
        "@celebix/platform-config/src/light-postgres-compat",
    ) as LightPostgresCompatModule;

    return compatModule.createLightPostgresCompatClient({
        env: process.env,
        mode: "light_postgres",
    }) as SupabaseClient;
}

// Lazy client initialization to prevent build-time errors
let _supabase: SupabaseClient | null = null;

function getSupabaseUrl(): string {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");

    const cleanedUrl = rawUrl.trim().replace(/^["']|["']$/g, "");
    const normalizedUrl = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;

    try {
        const parsed = new URL(normalizedUrl);
        if (!parsed.hostname) {
            throw new Error("missing hostname");
        }
        return parsed.toString().replace(/\/$/, "");
    } catch {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is malformed");
    }
}

function getSupabaseAnonKey(): string {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, "");
    if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
    return key;
}

// Client for browser/client-side operations (lazy initialization)
export const supabase = new Proxy({} as SupabaseClient, {
    get(_, prop) {
        if (!_supabase) {
            _supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (_supabase as any)[prop as string];
    },
});

export function createPublicServerClient() {
    if (isLightPostgresRuntime(process.env, {
        mode: ["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
    })) {
        return createLightPostgresServerCompatClient();
    }

    return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

// Server client with service role for admin operations
export function createServerClient() {
    if (isLightPostgresRuntime(process.env, {
        mode: ["DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
    })) {
        return createLightPostgresServerCompatClient();
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        console.warn("SUPABASE_SERVICE_ROLE_KEY is not configured - using anon key instead");
        return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }

    return createClient(getSupabaseUrl(), serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

// Generate UUID for new records
export function uuid() {
    return crypto.randomUUID();
}


// Type definitions for database tables
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
    total_orders: number;
    total_spent: number;
    created_at: string;
}

export interface Address {
    id: string;
    customer_id: string;
    type: string;
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
