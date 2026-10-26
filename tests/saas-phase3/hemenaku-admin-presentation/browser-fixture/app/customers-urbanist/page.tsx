import { CustomersUrbanistFixture } from "./screen";

export default async function CustomersUrbanistPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <CustomersUrbanistFixture view={typeof query.view === "string" ? query.view : "list"} scenario={typeof query.state === "string" ? query.state : "loaded"} customerId={typeof query.id === "string" ? query.id : undefined} />;
}
