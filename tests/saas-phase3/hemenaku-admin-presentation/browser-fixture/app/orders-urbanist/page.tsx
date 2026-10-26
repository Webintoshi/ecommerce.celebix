import { OrdersUrbanistFixture } from "./screen";

export default async function OrdersUrbanistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <OrdersUrbanistFixture view={typeof query.view === "string" ? query.view : "edit"} scenario={typeof query.state === "string" ? query.state : "ready"} />;
}
