import { LoyaltyProgramEditor } from "@/components/loyalty/LoyaltyEditor";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function LoyaltyProgramPage({ params }: Readonly<{ params: Promise<{ programId: string }> }>) {
  const [context, { programId }] = await Promise.all([requirePromotionPageContext(), params]);
  return <LoyaltyProgramEditor {...context} programId={programId}/>;
}
