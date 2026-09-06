import { PromotionAnalytics } from "@/components/promotions/PromotionAnalytics";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function PromotionAnalyticsPage({ params }: { params: Promise<{ promotionId: string }> }) { const { promotionId } = await params; await requirePromotionPageContext(); return <PromotionAnalytics promotionId={promotionId} />; }
