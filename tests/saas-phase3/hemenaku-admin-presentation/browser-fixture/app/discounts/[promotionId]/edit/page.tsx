import { PromotionFixtureScreen } from "../../../mira-promotions/PromotionFixtureScreen";

export default async function EditDiscountFixturePage({ params }: Readonly<{ params: Promise<{ promotionId: string }> }>) {
  const { promotionId } = await params;
  return <PromotionFixtureScreen view="edit" promotionId={promotionId} />;
}
