import { PromotionFixtureScreen } from "../../mira-promotions/[view]/page";

export default async function DiscountFixturePage({ params }: Readonly<{ params: Promise<{ promotionId: string }> }>) {
  const { promotionId } = await params;
  return <PromotionFixtureScreen view="detail" promotionId={promotionId} />;
}
