import { PromotionFixtureScreen } from "../../../mira-promotions/[view]/page";

export default async function EditDiscountFixturePage({ params }: Readonly<{ params: Promise<{ promotionId: string }> }>) {
  const { promotionId } = await params;
  return <PromotionFixtureScreen view="edit" promotionId={promotionId} />;
}
