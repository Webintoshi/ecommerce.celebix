import { PromotionFixtureScreen } from "../../mira-promotions/PromotionFixtureScreen";

export default async function DiscountFixturePage({ params }: Readonly<{ params: Promise<{ promotionId: string }> }>) {
  const { promotionId } = await params;
  return <PromotionFixtureScreen view="detail" promotionId={promotionId} />;
}
