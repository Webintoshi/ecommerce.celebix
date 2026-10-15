import { PromotionCodes } from "@/components/promotions/PromotionCodes";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function PromotionCodesPage({ params }: { params: Promise<{ promotionId: string }> }) { const { promotionId } = await params; const context = await requirePromotionPageContext(); return <PromotionCodes promotionId={promotionId} {...context} />; }
