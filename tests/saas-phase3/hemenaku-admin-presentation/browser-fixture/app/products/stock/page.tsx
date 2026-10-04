import { StockWorkspaceFixture } from "./screen";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <StockWorkspaceFixture scenario={state === "readonly" || state === "error" ? state : "loaded"} />;
}
