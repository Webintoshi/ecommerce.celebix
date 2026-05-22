import type { Metadata } from "next";
import { CheckCircle2, Clock3, MessageSquare, XCircle } from "lucide-react";
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
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--admin-border)] px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-0">
                  <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                    Ürün Yorumları
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#f0ddd0] via-[#f7ebe2] to-[#f0ddd0] md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Toplam yorum",
                  value: counts.all.toLocaleString("tr-TR"),
                  icon: MessageSquare,
                  tone: "text-[var(--admin-accent)]",
                },
                {
                  label: "Onay bekleyen",
                  value: counts.pending.toLocaleString("tr-TR"),
                  icon: Clock3,
                  tone: "text-amber-700",
                },
                {
                  label: "Yayındaki yorum",
                  value: counts.approved.toLocaleString("tr-TR"),
                  icon: CheckCircle2,
                  tone: "text-emerald-700",
                },
                {
                  label: "Reddedilen",
                  value: counts.rejected.toLocaleString("tr-TR"),
                  icon: XCircle,
                  tone: "text-rose-700",
                },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                        <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-stone-950 md:text-[30px]">{metric.value}</p>
                      </div>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white shadow-sm ${metric.tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <ProductReviewsManager initialReviews={reviews} initialCounts={counts} />
        </div>
      </div>
    </main>
  );
}
