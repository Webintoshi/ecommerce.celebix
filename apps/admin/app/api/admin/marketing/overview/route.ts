import { NextResponse } from "next/server";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { createServerClient } from "@/lib/supabase";

type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  total_spent: number | string | null;
  total_orders: number | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  total: number | string | null;
  status: string | null;
  created_at: string;
};

type AbandonedCartRow = {
  id: string;
  total: number | string | null;
  recovered: boolean | null;
  status: string | null;
  created_at: string;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function percentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function previousMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 1);
  return { start, end };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx];
}

function isBetween(dateIso: string, start: Date, end: Date): boolean {
  const date = new Date(dateIso);
  return date >= start && date < end;
}

export async function GET() {
  try {
    const payload = await getOrSetCachedValue("admin:marketing:overview", 60_000, async () => {
      const supabase = createServerClient();
      const now = new Date();
      const monthStart = startOfMonth(now);
      const { start: prevMonthStart, end: prevMonthEnd } = previousMonthRange(now);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        { data: customers, error: customersError },
        { data: orders, error: ordersError },
        { data: abandonedCarts, error: abandonedError },
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id,email,phone,total_spent,total_orders,created_at"),
        supabase
          .from("orders")
          .select("id,total,status,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("abandoned_carts")
          .select("id,total,recovered,status,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (customersError) throw customersError;
      if (ordersError) throw ordersError;

      const customerRows = (customers || []) as CustomerRow[];
      const orderRows = (orders || []) as OrderRow[];
      const abandonedRows = abandonedError ? [] : ((abandonedCarts || []) as AbandonedCartRow[]);

      const totalCustomers = customerRows.length;
      const emailReachable = customerRows.filter((c) => Boolean(c.email)).length;
      const phoneReachable = customerRows.filter((c) => Boolean(c.phone)).length;
      const contactMissing = customerRows.filter((c) => !c.email && !c.phone).length;

      const spendValues = customerRows.map((c) => toNumber(c.total_spent)).filter((s) => s > 0);
      const vipThreshold = spendValues.length >= 5 ? percentile(spendValues, 80) : 0;
      const vipCustomers = customerRows.filter((c) => toNumber(c.total_spent) >= vipThreshold && toNumber(c.total_spent) > 0).length;
      const newCustomers30d = customerRows.filter((c) => new Date(c.created_at) >= thirtyDaysAgo).length;

      const completedStatuses = new Set(["processing", "shipped", "completed", "delivered"]);
      const paidOrders = orderRows.filter((o) => (o.status ? completedStatuses.has(o.status) : true));

      const totalRevenue = paidOrders.reduce((sum, o) => sum + toNumber(o.total), 0);
      const monthRevenue = paidOrders
        .filter((o) => new Date(o.created_at) >= monthStart)
        .reduce((sum, o) => sum + toNumber(o.total), 0);
      const prevMonthRevenue = paidOrders
        .filter((o) => isBetween(o.created_at, prevMonthStart, prevMonthEnd))
        .reduce((sum, o) => sum + toNumber(o.total), 0);
      const revenueChange = percentageChange(monthRevenue, prevMonthRevenue);

      const monthNewCustomers = customerRows.filter((c) => new Date(c.created_at) >= monthStart).length;
      const prevMonthNewCustomers = customerRows.filter((c) =>
        isBetween(c.created_at, prevMonthStart, prevMonthEnd)
      ).length;
      const customerChange = percentageChange(monthNewCustomers, prevMonthNewCustomers);

      const activeAbandoned = abandonedRows.filter((c) => !c.recovered).length;
      const recoveredAbandoned = abandonedRows.filter((c) => c.recovered).length;
      const recoveryRate = percentage(recoveredAbandoned, abandonedRows.length);
      const abandonedValue = abandonedRows
        .filter((c) => !c.recovered)
        .reduce((sum, c) => sum + toNumber(c.total), 0);

      return {
        stats: {
          totalCustomers,
          emailReachable,
          phoneReachable,
          vipCustomers,
          newCustomers30d,
          totalRevenue,
          monthRevenue,
          revenueChange,
          customerChange,
          contactMissing,
        },
        channels: [
          {
            id: "email",
            title: "E-posta Kampanyaları",
            description: "E-posta adresi olan müşterilere toplu kampanya gönderimi.",
            href: "/admin/pazarlama/email",
            metric: `%${percentage(emailReachable, totalCustomers)} erişim`,
          },
          {
            id: "whatsapp",
            title: "WhatsApp İletişim",
            description: "Telefonu olan müşterilere hızlı ve kişisel iletişim akışı.",
            href: "/admin/pazarlama/whatsapp",
            metric: `%${percentage(phoneReachable, totalCustomers)} erişim`,
          },
          {
            id: "phone",
            title: "Telefon & SMS",
            description: "VIP ve kritik müşteri grupları için direkt arama/sms takibi.",
            href: "/admin/pazarlama/phone",
            metric: `${phoneReachable} müşteri`,
          },
        ],
        insights: [
          {
            id: "abandoned",
            title: "Terk Edilen Sepetler",
            value: activeAbandoned,
            subValue: `${abandonedValue.toLocaleString("tr-TR")} ₺ potansiyel`,
            change: `%${recoveryRate} geri kazanım`,
            actionLabel: "Sepet Terk Listesi",
            actionHref: "/admin/siparisler/sepet-terk",
            type: "warning",
          },
          {
            id: "new-customers",
            title: "Bu Ay Yeni Müşteri",
            value: monthNewCustomers,
            subValue: `Son 30 gün: ${newCustomers30d}`,
            change: `${customerChange >= 0 ? "+" : ""}%${customerChange}`,
            actionLabel: "Müşteri Segmentleri",
            actionHref: "/admin/musteriler/segmentler",
            type: "success",
          },
          {
            id: "contact-gap",
            title: "İletişim Bilgisi Eksik",
            value: contactMissing,
            subValue: "E-posta + telefon eksik müşteri",
            change: "Temizlik gerekli",
            actionLabel: "Müşteri Listesine Git",
            actionHref: "/admin/musteriler",
            type: "info",
          },
        ],
      };
    });

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error("Marketing overview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Pazarlama verileri alınamadı.",
      },
      { status: 500 }
    );
  }
}
