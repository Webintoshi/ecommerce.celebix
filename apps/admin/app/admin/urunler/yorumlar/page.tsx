import { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { ProductReviewsManager } from "@/components/admin/product-reviews/ProductReviewsManager";
import { listAdminProductReviews } from "@/lib/product-reviews";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: `Ürün Yorumları | ${STORE_RUNTIME.name} Admin`,
  description: "Ürün yorumlarını onaylayın, reddedin ve yayına alın.",
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <MessageSquare className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ürün Yorumları</h1>
          <p className="mt-1 text-gray-600">
            Müşteri yorumları önce onaya düşer. Onayladıklarınız tekil ürün sayfalarında yayınlanır.
          </p>
        </div>
      </div>

      <ProductReviewsManager initialReviews={reviews} initialCounts={counts} />
    </div>
  );
}
