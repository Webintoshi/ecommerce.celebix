import { createServerClient } from "@/lib/supabase";

export type AbandonedCartStatus = "active" | "abandoned" | "recovered" | "cleared";

type ServerClient = ReturnType<typeof createServerClient>;

type AbandonedCartRow = {
    id: string;
    cart_id?: string | null;
    store_slug?: string | null;
    customer_id?: string | null;
    session_id?: string | null;
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    is_anonymous?: boolean | null;
    items?: Record<string, unknown>[] | null;
    total?: number | string | null;
    item_count?: number | null;
    status?: string | null;
    recovered?: boolean | null;
    recovered_at?: string | null;
    abandoned_at?: string | null;
    checkout_started_at?: string | null;
    last_activity_at?: string | null;
    order_id?: string | null;
    created_at?: string | null;
};

type AbandonedCartLookup = {
    id?: string;
    cartId?: string | null;
    sessionId?: string | null;
    customerId?: string | null;
    email?: string | null;
};

type UpsertAbandonedCartInput = {
    cartId?: string | null;
    sessionId?: string | null;
    customerId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    isAnonymous?: boolean;
    items?: Record<string, unknown>[] | null;
    total?: number;
    itemCount?: number;
    status?: AbandonedCartStatus | null;
    checkoutStartedAt?: string | null;
    orderId?: string | null;
};

export const ABANDONED_CART_TIMEOUT_MINUTES = 30;
const ABANDONED_CART_TIMEOUT_MS = ABANDONED_CART_TIMEOUT_MINUTES * 60 * 1000;

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) {
        return String((error as { message?: string }).message || "");
    }
    return String(error || "");
}

function isIgnorableSchemaError(error: unknown): boolean {
    const message = toErrorMessage(error).toLowerCase();
    return (
        message.includes("abandoned_carts") ||
        message.includes("compatibility table destegi bulunamadi") ||
        message.includes("light_postgres compatibility") ||
        message.includes("desteklenmiyor") ||
        message.includes("insert desteklenmiyor") ||
        message.includes("update desteklenmiyor") ||
        message.includes("delete desteklenmiyor") ||
        message.includes("42p01") ||
        message.includes("unsupported") ||
        message.includes("column") ||
        message.includes("schema cache") ||
        message.includes("could not find") ||
        message.includes("does not exist")
    );
}

export function isAbandonedCartUnavailableError(error: unknown): boolean {
    return isIgnorableSchemaError(error);
}

function normalizeStatus(
    status: string | null | undefined,
    recovered: boolean | null | undefined
): AbandonedCartStatus {
    if (recovered) return "recovered";
    if (status === "active" || status === "abandoned" || status === "recovered" || status === "cleared") {
        return status;
    }
    return "abandoned";
}

function isOpenCart(cart: AbandonedCartRow): boolean {
    const status = normalizeStatus(cart.status, cart.recovered);
    return status !== "recovered" && status !== "cleared" && !cart.recovered;
}

function buildLookupTargets(lookup: AbandonedCartLookup) {
    return [
        lookup.cartId ? { column: "cart_id", value: lookup.cartId } : null,
        lookup.sessionId ? { column: "session_id", value: lookup.sessionId } : null,
        lookup.customerId ? { column: "customer_id", value: lookup.customerId } : null,
        lookup.email ? { column: "email", value: lookup.email } : null,
    ].filter((entry): entry is { column: string; value: string } => Boolean(entry?.value));
}

function calculateItemCount(items?: Record<string, unknown>[] | null): number {
    if (!items || items.length === 0) return 0;

    return items.reduce((sum, item) => {
        const quantity = item.quantity;
        if (typeof quantity === "number" && Number.isFinite(quantity)) {
            return sum + quantity;
        }
        if (typeof quantity === "string") {
            const parsed = Number(quantity);
            return sum + (Number.isFinite(parsed) ? parsed : 1);
        }
        return sum + 1;
    }, 0);
}

function resolveStoreSlug(): string | null {
    return process.env.NEXT_PUBLIC_STORE_SLUG?.trim() || process.env.STORE_SLUG?.trim() || null;
}

export async function findAbandonedCartByLookup(
    lookup: AbandonedCartLookup,
    options?: { onlyOpen?: boolean },
    serverClient: ServerClient = createServerClient()
): Promise<AbandonedCartRow | null> {
    if (lookup.id) {
        const { data, error } = await serverClient
            .from("abandoned_carts")
            .select("*")
            .eq("id", lookup.id)
            .single();

        if (error) throw error;
        return data as AbandonedCartRow;
    }

    const targets = buildLookupTargets(lookup);
    let lastError: unknown = null;

    for (const target of targets) {
        const { data, error } = await serverClient
            .from("abandoned_carts")
            .select("*")
            .eq(target.column, target.value)
            .order("created_at", { ascending: false })
            .limit(25);

        if (error) {
            lastError = error;
            continue;
        }

        const rows = (data || []) as AbandonedCartRow[];
        const match = options?.onlyOpen ? rows.find(isOpenCart) : rows[0];

        if (match) {
            return match;
        }
    }

    if (lastError) {
        throw lastError;
    }

    return null;
}

export async function syncAbandonedCartStatuses(
    serverClient: ServerClient = createServerClient()
): Promise<void> {
    const staleBefore = new Date(Date.now() - ABANDONED_CART_TIMEOUT_MS).toISOString();
    const nowIso = new Date().toISOString();

    const { error: recoveredError } = await serverClient
        .from("abandoned_carts")
        .update({ status: "recovered" })
        .eq("recovered", true)
        .neq("status", "recovered");

    if (recoveredError && !isIgnorableSchemaError(recoveredError)) {
        throw recoveredError;
    }

    const { error: abandonedError } = await serverClient
        .from("abandoned_carts")
        .update({
            status: "abandoned",
            abandoned_at: nowIso,
        })
        .eq("recovered", false)
        .eq("status", "active")
        .gt("item_count", 0)
        .lt("updated_at", staleBefore);

    if (abandonedError && !isIgnorableSchemaError(abandonedError)) {
        throw abandonedError;
    }
}

export async function upsertAbandonedCart(
    input: UpsertAbandonedCartInput,
    serverClient: ServerClient = createServerClient()
) {
    const lookup = {
        cartId: input.cartId,
        sessionId: input.sessionId,
        customerId: input.customerId,
        email: input.email,
    };
    const existing = await findAbandonedCartByLookup(lookup, { onlyOpen: true }, serverClient);
    const nowIso = new Date().toISOString();
    const nextStatus = input.status || "active";
    const nextRecovered = nextStatus === "recovered";

    if (!existing && (!input.items || typeof input.total !== "number")) {
        throw new Error("Yeni bir sepet kaydi icin urunler ve toplam tutar gereklidir.");
    }

    const resolvedItems = input.items ?? existing?.items ?? [];
    const resolvedTotal =
        typeof input.total === "number" ? input.total : Number(existing?.total || 0);
    const resolvedItemCount =
        typeof input.itemCount === "number"
            ? input.itemCount
            : input.items
              ? calculateItemCount(input.items)
              : Number(existing?.item_count || 0);
    const resolvedIsAnonymous =
        input.isAnonymous ??
        existing?.is_anonymous ??
        !Boolean(input.customerId || existing?.customer_id || input.email || existing?.email);

    const payload = {
        store_slug: existing?.store_slug ?? resolveStoreSlug(),
        cart_id: input.cartId ?? existing?.cart_id ?? null,
        session_id: input.sessionId ?? existing?.session_id ?? null,
        customer_id: input.customerId ?? existing?.customer_id ?? null,
        first_name: input.firstName ?? existing?.first_name ?? null,
        last_name: input.lastName ?? existing?.last_name ?? null,
        email: input.email ?? existing?.email ?? null,
        phone: input.phone ?? existing?.phone ?? null,
        is_anonymous: resolvedIsAnonymous,
        items: resolvedItems,
        total: resolvedTotal,
        item_count: resolvedItemCount,
        status: nextStatus,
        recovered: nextRecovered ? true : false,
        recovered_at: nextRecovered ? nowIso : null,
        checkout_started_at:
            input.checkoutStartedAt ??
            existing?.checkout_started_at ??
            (input.email || input.phone || input.firstName || input.lastName ? nowIso : null),
        last_activity_at: nowIso,
        order_id: input.orderId ?? existing?.order_id ?? null,
        abandoned_at:
            nextStatus === "abandoned"
                ? existing?.abandoned_at ?? nowIso
                : null,
        updated_at: nowIso,
    };

    if (existing) {
        const { data, error } = await serverClient
            .from("abandoned_carts")
            .update(payload)
            .eq("id", existing.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    const { data, error } = await serverClient
        .from("abandoned_carts")
        .insert(payload)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function markAbandonedCartAsRecovered(
    lookup: AbandonedCartLookup,
    optionsOrServerClient?: { orderId?: string | null } | ServerClient,
    serverClient?: ServerClient
) {
    const resolvedServerClient =
        optionsOrServerClient && typeof (optionsOrServerClient as ServerClient).from === "function"
            ? (optionsOrServerClient as ServerClient)
            : serverClient ?? createServerClient();
    const options =
        optionsOrServerClient && typeof (optionsOrServerClient as ServerClient).from === "function"
            ? undefined
            : (optionsOrServerClient as { orderId?: string | null } | undefined);
    const existing = await findAbandonedCartByLookup(lookup, { onlyOpen: true }, resolvedServerClient);
    if (!existing) return null;

    const recoveredAt = new Date().toISOString();
    const { data, error } = await resolvedServerClient
        .from("abandoned_carts")
        .update({
            recovered: true,
            status: "recovered",
            recovered_at: recoveredAt,
            last_activity_at: recoveredAt,
            order_id: options?.orderId ?? existing.order_id ?? null,
            updated_at: recoveredAt,
        })
        .eq("id", existing.id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteLatestOpenAbandonedCartForSession(
    sessionId: string,
    serverClient: ServerClient = createServerClient()
) {
    const existing = await findAbandonedCartByLookup(
        { sessionId },
        { onlyOpen: true },
        serverClient
    );

    if (!existing) return true;

    const { error } = await serverClient
        .from("abandoned_carts")
        .delete()
        .eq("id", existing.id);

    if (error) throw error;
    return true;
}

export async function createAbandonedCart(data: {
    cartId?: string;
    customerId?: string;
    sessionId?: string;
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    isAnonymous?: boolean;
    items: Record<string, unknown>[];
    total: number;
    itemCount?: number;
}) {
    return upsertAbandonedCart({
        cartId: data.cartId,
        customerId: data.customerId,
        sessionId: data.sessionId,
        email: data.email,
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        isAnonymous: data.isAnonymous,
        items: data.items,
        total: data.total,
        itemCount: data.itemCount,
        status: "active",
    });
}

export async function getAbandonedCarts(options?: {
    recovered?: boolean;
    limit?: number;
    offset?: number;
    includeActive?: boolean;
}) {
    const serverClient = createServerClient();
    await syncAbandonedCartStatuses(serverClient);

    let query = serverClient
        .from("abandoned_carts")
        .select("*")
        .order("created_at", { ascending: false });

    if (options?.recovered === true) {
        query = query.eq("recovered", true);
    } else if (options?.recovered === false) {
        query = query.eq("recovered", false).eq("status", "abandoned");
    } else if (!options?.includeActive) {
        query = query.in("status", ["abandoned", "recovered"]);
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

export async function getAbandonedCartById(id: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("abandoned_carts")
        .select("*")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

export async function markCartAsRecovered(id: string) {
    return markAbandonedCartAsRecovered({ id });
}

export async function deleteAbandonedCart(id: string) {
    const serverClient = createServerClient();

    const { error } = await serverClient
        .from("abandoned_carts")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}

export async function getAbandonedCartStats() {
    const serverClient = createServerClient();
    await syncAbandonedCartStatuses(serverClient);

    const { data: carts, error } = await serverClient
        .from("abandoned_carts")
        .select("total, recovered, status, created_at")
        .in("status", ["abandoned", "recovered"]);

    if (error) throw error;

    const typedCarts = (carts || []) as Array<{
        total: number | string | null;
        recovered: boolean | null;
        status: string | null;
        created_at: string;
    }>;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayCarts = typedCarts.filter(c => new Date(c.created_at) >= today);
    const weekCarts = typedCarts.filter(c => new Date(c.created_at) >= thisWeek);
    const recoveredCarts = typedCarts.filter(c => normalizeStatus(c.status, c.recovered) === "recovered");

    return {
        total: typedCarts.length,
        totalValue: typedCarts.reduce((sum, c) => sum + Number(c.total || 0), 0),
        recovered: recoveredCarts.length,
        recoveredValue: recoveredCarts.reduce((sum, c) => sum + Number(c.total || 0), 0),
        recoveryRate: typedCarts.length > 0 ? (recoveredCarts.length / typedCarts.length) * 100 : 0,
        todayCount: todayCarts.length,
        weekCount: weekCarts.length,
    };
}
