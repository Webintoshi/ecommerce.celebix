import { PromotionStudio } from "@/components/promotions/PromotionStudio";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function PromotionPage({ params }: { params: Promise<{ promotionId: string }> }) { const { promotionId } = await params; const context = await requirePromotionPageContext(); return <PromotionStudio mode="view" promotionId={promotionId} {...context} />; }
