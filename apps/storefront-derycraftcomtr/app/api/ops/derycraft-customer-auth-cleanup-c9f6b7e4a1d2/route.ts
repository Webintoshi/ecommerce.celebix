import { NextRequest, NextResponse } from "next/server";
import { validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { createServerClient } from "@/lib/supabase";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { withLightPostgresTransaction } from "@/lib/db/light-postgres-client";

export const dynamic = "force-dynamic";

const TEST_EMAIL_PREFIX = "atlas-test-derycraftcomtr-customer-auth-";
const TEST_EMAIL_PATTERN = `${TEST_EMAIL_PREFIX}%`;

type CleanupAction = "count" | "cleanup";

type JsonRecord = Record<string, unknown>;

type LightClient = {
  query: <TRow extends JsonRecord = JsonRecord>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: TRow[] }>;
};

type LightScope = {
  customerEmails: string[];
  customerIds: string[];
  orderIds: string[];
  orderNumbers: string[];
  orderItemIds: string[];
  paymentIds: string[];
  principalEmails: string[];
  principalIds: string[];
};

type LightCounts = {
  auth_audit_bridge_events: number;
  auth_principals: number;
  auth_store_customer_links: number;
  auth_store_memberships: number;
  customer_addresses: number;
  customers: number;
  order_item_customizations: number;
  order_items: number;
  order_status_history: number;
  orders: number;
  payment_events: number;
  payments: number;
};

type SupabaseAuthSummary = {
  count: number | null;
  emails: string[];
  error?: string;
};

type SupabaseTableSummary = Record<string, number | null>;

function requireCleanupAccess(request: NextRequest) {
  const originCheck = validateSameOriginRequest(request);
  if (!originCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Bu cleanup endpointi yalnizca ayni origin uzerinden cagrilabilir." },
      { status: 403 },
    );
  }

  return null;
}

function normalizeAction(value: unknown): CleanupAction | null {
  return value === "count" || value === "cleanup" ? value : null;
}

function asUuidArray(values: string[]) {
  return values.length > 0 ? values : [];
}

async function selectStringList(
  client: LightClient,
  text: string,
  params: readonly unknown[] = [],
  field = "id",
) {
  const result = await client.query<Record<string, string | null>>(text, [...params]);

  return result.rows
    .map((row) => row[field])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function countRows(
  client: LightClient,
  text: string,
  params: readonly unknown[] = [],
) {
  const result = await client.query<{ count: number | string }>(text, [...params]);
  const rawCount = result.rows[0]?.count ?? 0;
  return Number(rawCount) || 0;
}

async function loadLightScope(client: LightClient): Promise<LightScope> {
  const customerIds = await selectStringList(
    client,
    `
      select id
      from public.customers
      where email ilike $1
      order by created_at asc
    `,
    [TEST_EMAIL_PATTERN],
  );
  const customerEmails = await selectStringList(
    client,
    `
      select email
      from public.customers
      where email ilike $1
      order by created_at asc
    `,
    [TEST_EMAIL_PATTERN],
    "email",
  );
  const principalIds = await selectStringList(
    client,
    `
      select id
      from auth_principals
      where email_normalized ilike $1
      order by created_at asc
    `,
    [TEST_EMAIL_PATTERN],
  );
  const principalEmails = await selectStringList(
    client,
    `
      select email_normalized
      from auth_principals
      where email_normalized ilike $1
      order by created_at asc
    `,
    [TEST_EMAIL_PATTERN],
    "email_normalized",
  );
  const orderIds = await selectStringList(
    client,
    `
      select id
      from public.orders
      where customer_id = any($1::uuid[])
      order by created_at asc
    `,
    [asUuidArray(customerIds)],
  );
  const orderNumbers = await selectStringList(
    client,
    `
      select order_number
      from public.orders
      where customer_id = any($1::uuid[])
      order by created_at asc
    `,
    [asUuidArray(customerIds)],
    "order_number",
  );
  const orderItemIds = await selectStringList(
    client,
    `
      select id
      from public.order_items
      where order_id = any($1::uuid[])
      order by created_at asc
    `,
    [asUuidArray(orderIds)],
  );
  const paymentIds = await selectStringList(
    client,
    `
      select id
      from public.payments
      where customer_email ilike $1
         or order_id = any($2::uuid[])
      order by created_at asc
    `,
    [TEST_EMAIL_PATTERN, asUuidArray(orderIds)],
  );

  return {
    customerEmails,
    customerIds,
    orderIds,
    orderNumbers,
    orderItemIds,
    paymentIds,
    principalEmails,
    principalIds,
  };
}

async function loadLightCounts(client: LightClient, scope: LightScope): Promise<LightCounts> {
  const [customerAddresses, orderItemCustomizations, orderStatusHistory, paymentEvents, memberships, links, audit] =
    await Promise.all([
      countRows(
        client,
        "select count(*)::int as count from public.customer_addresses where customer_id = any($1::uuid[])",
        [asUuidArray(scope.customerIds)],
      ),
      countRows(
        client,
        "select count(*)::int as count from public.order_item_customizations where order_item_id = any($1::uuid[])",
        [asUuidArray(scope.orderItemIds)],
      ),
      countRows(
        client,
        "select count(*)::int as count from public.order_status_history where order_id = any($1::uuid[])",
        [asUuidArray(scope.orderIds)],
      ),
      countRows(
        client,
        `
          select count(*)::int as count
          from public.payment_events
          where payment_id = any($1::uuid[])
             or order_id = any($2::uuid[])
        `,
        [asUuidArray(scope.paymentIds), asUuidArray(scope.orderIds)],
      ),
      countRows(
        client,
        `
          select count(*)::int as count
          from auth_store_memberships
          where principal_id = any($1::uuid[])
            and store_slug = $2
        `,
        [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug],
      ),
      countRows(
        client,
        `
          select count(*)::int as count
          from auth_store_customer_links
          where store_slug = $2
            and (
              principal_id = any($1::uuid[])
              or legacy_customer_id = any($3::uuid[])
            )
        `,
        [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug, asUuidArray(scope.customerIds)],
      ),
      countRows(
        client,
        `
          select count(*)::int as count
          from auth_audit_bridge_events
          where store_slug = $2
            and principal_id = any($1::uuid[])
        `,
        [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug],
      ),
    ]);

  return {
    auth_audit_bridge_events: audit,
    auth_principals: scope.principalIds.length,
    auth_store_customer_links: links,
    auth_store_memberships: memberships,
    customer_addresses: customerAddresses,
    customers: scope.customerIds.length,
    order_item_customizations: orderItemCustomizations,
    order_items: scope.orderItemIds.length,
    order_status_history: orderStatusHistory,
    orders: scope.orderIds.length,
    payment_events: paymentEvents,
    payments: scope.paymentIds.length,
  };
}

async function deleteLightScope(client: LightClient, scope: LightScope) {
  await client.query(
    "delete from public.payment_events where payment_id = any($1::uuid[]) or order_id = any($2::uuid[])",
    [asUuidArray(scope.paymentIds), asUuidArray(scope.orderIds)],
  );
  await client.query("delete from public.payments where id = any($1::uuid[])", [asUuidArray(scope.paymentIds)]);
  await client.query("delete from public.order_status_history where order_id = any($1::uuid[])", [
    asUuidArray(scope.orderIds),
  ]);
  await client.query("delete from public.order_item_customizations where order_item_id = any($1::uuid[])", [
    asUuidArray(scope.orderItemIds),
  ]);
  await client.query("delete from public.order_items where id = any($1::uuid[])", [
    asUuidArray(scope.orderItemIds),
  ]);
  await client.query("delete from public.orders where id = any($1::uuid[])", [asUuidArray(scope.orderIds)]);
  await client.query("delete from public.customer_addresses where customer_id = any($1::uuid[])", [
    asUuidArray(scope.customerIds),
  ]);
  await client.query(
    "delete from auth_audit_bridge_events where principal_id = any($1::uuid[]) and store_slug = $2",
    [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug],
  );
  await client.query(
    "delete from auth_store_customer_links where store_slug = $2 and (principal_id = any($1::uuid[]) or legacy_customer_id = any($3::uuid[]))",
    [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug, asUuidArray(scope.customerIds)],
  );
  await client.query(
    "delete from auth_store_memberships where principal_id = any($1::uuid[]) and store_slug = $2",
    [asUuidArray(scope.principalIds), STOREFRONT_RUNTIME.slug],
  );
  await client.query("delete from auth_principals where id = any($1::uuid[])", [asUuidArray(scope.principalIds)]);
  await client.query("delete from public.customers where id = any($1::uuid[])", [asUuidArray(scope.customerIds)]);
}

async function countSupabaseTableByPrefix(table: string, column: string) {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .ilike(column, TEST_EMAIL_PATTERN);

  if (error) {
    return null;
  }

  return count ?? 0;
}

async function loadSupabaseBusinessCounts(): Promise<SupabaseTableSummary> {
  const [customers, abandonedCarts, paymentAttempts, checkoutSessions] = await Promise.all([
    countSupabaseTableByPrefix("customers", "email"),
    countSupabaseTableByPrefix("abandoned_carts", "email"),
    countSupabaseTableByPrefix("payment_attempts", "customer_email"),
    countSupabaseTableByPrefix("checkout_sessions", "email"),
  ]);

  return {
    abandoned_carts: abandonedCarts,
    checkout_sessions: checkoutSessions,
    customers,
    payment_attempts: paymentAttempts,
  };
}

async function loadSupabaseAuthSummary(): Promise<SupabaseAuthSummary> {
  const supabase = createServerClient();
  const emails: string[] = [];

  try {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });

      if (error) {
        return {
          count: null,
          emails: [],
          error: error.message,
        };
      }

      const users = data?.users ?? [];
      for (const user of users) {
        const email = user.email?.trim().toLowerCase();
        if (email?.startsWith(TEST_EMAIL_PREFIX)) {
          emails.push(email);
        }
      }

      if (users.length < 200) {
        break;
      }
    }

    return {
      count: emails.length,
      emails,
    };
  } catch (error) {
    return {
      count: null,
      emails: [],
      error: error instanceof Error ? error.message : "Supabase auth count okunamadi.",
    };
  }
}

async function runLightCount() {
  return withLightPostgresTransaction(async (client) => {
    const scope = await loadLightScope(client);
    const counts = await loadLightCounts(client, scope);

    return {
      counts,
      scope: {
        customerEmails: scope.customerEmails,
        orderNumbers: scope.orderNumbers,
        principalEmails: scope.principalEmails,
      },
    };
  });
}

async function runLightCleanup() {
  return withLightPostgresTransaction(async (client) => {
    const beforeScope = await loadLightScope(client);
    const before = await loadLightCounts(client, beforeScope);

    if (Object.values(before).some((value) => value > 0)) {
      await deleteLightScope(client, beforeScope);
    }

    const afterScope = await loadLightScope(client);
    const after = await loadLightCounts(client, afterScope);

    return {
      after,
      before,
      deleted: {
        customerEmails: beforeScope.customerEmails,
        orderNumbers: beforeScope.orderNumbers,
        principalEmails: beforeScope.principalEmails,
      },
    };
  });
}

export async function POST(request: NextRequest) {
  const unauthorizedResponse = requireCleanupAccess(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  let body: { action?: CleanupAction };

  try {
    body = (await request.json()) as { action?: CleanupAction };
  } catch {
    return NextResponse.json({ success: false, error: "Gecersiz JSON payload." }, { status: 400 });
  }

  const action = normalizeAction(body.action);
  if (!action) {
    return NextResponse.json(
      { success: false, error: "action yalnizca count veya cleanup olabilir." },
      { status: 400 },
    );
  }

  try {
    const [light, supabaseBusiness, supabaseAuth] = await Promise.all([
      action === "cleanup" ? runLightCleanup() : runLightCount(),
      loadSupabaseBusinessCounts(),
      loadSupabaseAuthSummary(),
    ]);

    return NextResponse.json({
      success: true,
      action,
      storeSlug: STOREFRONT_RUNTIME.slug,
      testEmailPrefix: TEST_EMAIL_PREFIX,
      lightPostgres: light,
      supabase: {
        auth: supabaseAuth,
        business: supabaseBusiness,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cleanup islemi tamamlanamadi.",
      },
      { status: 500 },
    );
  }
}
