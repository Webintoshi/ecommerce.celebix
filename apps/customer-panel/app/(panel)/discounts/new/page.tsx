import { PromotionStudio } from "@/components/promotions/PromotionStudio";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";
export default async function NewDiscountPage() { const context = await requirePromotionPageContext(); return <PromotionStudio mode="create" {...context} />; }
