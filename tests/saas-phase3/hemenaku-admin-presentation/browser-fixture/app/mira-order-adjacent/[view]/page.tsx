import { OrderAdjacentFixture } from "../order-adjacent-fixture";

export default async function MiraOrderAdjacentFixturePage({ params }: Readonly<{ params: Promise<{ view: string }> }>) {
  const { view } = await params;
  return <OrderAdjacentFixture view={view} />;
}
