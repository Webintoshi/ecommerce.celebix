import { ProductsAntislopFixture } from "./screen";
import { PRODUCT_SCENARIOS, type ProductsScenario } from "./transport";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const requested = (await searchParams).state;
  const state = PRODUCT_SCENARIOS.includes(requested as ProductsScenario) ? requested as ProductsScenario : "loaded";
  return <ProductsAntislopFixture key={state} state={state} />;
}
