import { PromotionStudio } from "@/components/promotions/PromotionStudio";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function DiscountsPage() { const context = await requirePromotionPageContext(); return <PromotionStudio mode="list" {...context} />; }
