import { LoyaltyProgramList } from "@/components/loyalty/LoyaltyPrograms";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function LoyaltyProgramsPage() {
  const context = await requirePromotionPageContext();
  return <LoyaltyProgramList {...context}/>;
}
