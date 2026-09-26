import { OrdersApprovedFixture } from "./orders-approved-fixture";

export default async function MiraOrdersApprovedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams;
  const value = (key: string) => typeof input[key] === "string" ? input[key] as string : "";
  return <OrdersApprovedFixture key={JSON.stringify(input)} initialView={value("view") || "list"} role={value("role") || "owner"} scenario={value("state") || "loaded"} mutationMode={value("mutate")} moreMode={value("more")} initialId={value("id")} initialStatus={value("status")} />;
}
