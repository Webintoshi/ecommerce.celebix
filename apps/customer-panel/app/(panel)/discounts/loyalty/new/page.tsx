import { LoyaltyProgramEditor } from "@/components/loyalty/LoyaltyEditor";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function NewLoyaltyProgramPage() {
  const context = await requirePromotionPageContext();
  return <LoyaltyProgramEditor {...context}/>;
}
