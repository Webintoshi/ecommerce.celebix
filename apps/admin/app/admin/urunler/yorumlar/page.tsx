import type { Metadata } from "next";
import { CheckCircle2, Clock3, MessageSquare, XCircle } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { ProductReviewsManager } from "@/components/admin/product-reviews/ProductReviewsManager";
import { listAdminProductReviews } from "@/lib/product-reviews";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: `Ürün Yorumları | ${STORE_RUNTIME.name} Admin`,
  description: "Ürün yorumlarını inceleyin, moderasyon kararlarını yönetin ve yayındaki içerikleri tek ekranda izleyin.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function ProductReviewsPage() {
  const supabase = createServerClient();
  const reviews = await listAdminProductReviews(supabase, { status: "all" });
  const counts = reviews.reduce(
    (accumulator, review) => {
      accumulator.all += 1;
      accumulator[review.status] += 1;
      return accumulator;
    },
    { all: 0, pending: 0, approved: 0, rejected: 0 },
  );

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Katalog"
          title="Ürün Yorumları"
          metrics={
            <>
              {[
                { label: "Toplam", value: counts.all, detail: "yorum", icon: MessageSquare, tone: "text-[var(--admin-accent)]" },
                { label: "Bekleyen", value: counts.pending, detail: "onay", icon: Clock3, tone: "text-amber-600" },
                { label: "Yayında", value: counts.approved, detail: "yorum", icon: CheckCircle2, tone: "text-emerald-600" },
                { label: "Reddedilen", value: counts.rejected, detail: "yorum", icon: XCircle, tone: "text-rose-600" },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                        {metric.label}
                      </p>
                      <Icon className={`h-4 w-4 ${metric.tone}`} />
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                        {metric.value.toLocaleString("tr-TR")}
                      </p>
                      <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                    </div>
                  </div>
                );
              })}
            </>
          }
        />

        <ProductReviewsManager initialReviews={reviews} initialCounts={counts} />
      </div>
    </main>
  );
}
