import { LegacyPromotionWarning, PromotionStudio } from "@/components/promotions/PromotionStudio";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function EditPromotionPage({ params }: { params: Promise<{ promotionId: string }> }) { const { promotionId } = await params; const context = await requirePromotionPageContext(); if (!promotionId) return <LegacyPromotionWarning />; return <PromotionStudio mode="edit" promotionId={promotionId} {...context} />; }
