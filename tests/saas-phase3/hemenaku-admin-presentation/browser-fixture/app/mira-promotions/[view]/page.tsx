import { PromotionFixtureScreen, type PromotionFixtureView } from "../PromotionFixtureScreen";

export default async function MiraPromotionsFixture({ params }: Readonly<{ params: Promise<{ view: string }> }>) {
  const { view } = await params;
  const selected: PromotionFixtureView = ["list", "new", "detail", "edit", "codes", "analytics"].includes(view) ? view as PromotionFixtureView : "list";
  return <PromotionFixtureScreen view={selected} />;
}
