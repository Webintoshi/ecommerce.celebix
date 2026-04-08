import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getStoreRuntime } from "@/lib/store-runtime";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { getSupabaseServiceRoleKey } from "@/lib/supabase-shared";

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isRevenueOrder(status: unknown): boolean {
  const normalized = typeof status === "string" ? status.toLowerCase() : "";
  return normalized !== "cancelled" && normalized !== "canceled" && normalized !== "failed";
}

export async function GET(request: Request) {
  const providedKey = request.headers.get("x-celebix-store-service-key")?.trim();
  const expectedKey = getSupabaseServiceRoleKey().trim();

  if (!providedKey || !safeCompare(providedKey, expectedKey)) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const runtime = getStoreRuntime();

  const [productCountResult, orderCountResult, customerCountResult, pendingCountResult, ordersResult, profilesResult, usersResult] =
    await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
      supabase.from("orders").select("total, status"),
      supabase.from("profiles").select("id, full_name, role, task_definition, created_at").order("created_at", { ascending: false }),
      supabase.auth.admin.listUsers(),
    ]);

  const queryErrors = [
    productCountResult.error,
    orderCountResult.error,
    customerCountResult.error,
    pendingCountResult.error,
    ordersResult.error,
    profilesResult.error,
    usersResult.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    return NextResponse.json(
      { error: queryErrors[0]?.message || "Snapshot okunamadi." },
      { status: 500 },
    );
  }

  const revenueOrders = (ordersResult.data ?? []).filter((order) => isRevenueOrder(order.status));
  const totalRevenue = revenueOrders.reduce((total, order) => total + Number(order.total ?? 0), 0);
  const orderCount = orderCountResult.count ?? 0;
  const profiles = profilesResult.data ?? [];
  const users = usersResult.data.users ?? [];

  return NextResponse.json({
    slug: runtime.slug,
    storefrontDomain: runtime.storefrontDomain,
    adminDomain: runtime.adminDomain,
    generatedAt: new Date().toISOString(),
    metrics: {
      productCount: productCountResult.count ?? 0,
      orderCount,
      customerCount: customerCountResult.count ?? 0,
      pendingOrderCount: pendingCountResult.count ?? 0,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      averageOrderValue: orderCount > 0 ? Number((totalRevenue / orderCount).toFixed(2)) : 0,
      lastSyncedAt: new Date().toISOString(),
    },
    storeAdmins: profiles.map((profile) => {
      const user = users.find((entry) => entry.id === profile.id);

      return {
        id: profile.id,
        email: user?.email || "unknown",
        fullName: profile.full_name,
        role: profile.role,
        taskDefinition: profile.task_definition,
        createdAt: profile.created_at ?? null,
      };
    }),
  });
}
