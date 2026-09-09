import { PromotionFixtureScreen } from "../../../mira-promotions/PromotionFixtureScreen";

export default async function DiscountCodesFixturePage({ params }: Readonly<{ params: Promise<{ promotionId: string }> }>) {
  const { promotionId } = await params;
  return <PromotionFixtureScreen view="codes" promotionId={promotionId} />;
}
