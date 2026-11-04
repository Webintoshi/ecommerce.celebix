import { LoyaltyProgramReport } from "@/components/loyalty/LoyaltyPrograms";
import { requirePromotionPageContext } from "@/lib/server-promotion-page";

export default async function LoyaltyProgramReportPage({ params }: Readonly<{ params: Promise<{ programId: string }> }>) {
  const [context, { programId }] = await Promise.all([requirePromotionPageContext(), params]);
  return <LoyaltyProgramReport {...context} programId={programId}/>;
}
