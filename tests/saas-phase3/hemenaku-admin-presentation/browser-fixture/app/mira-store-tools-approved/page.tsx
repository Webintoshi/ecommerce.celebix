import { StoreToolsApprovedFixture, type StoreToolsScenario } from "./screen";

const states: readonly StoreToolsScenario[] = ["loaded", "readonly", "conflict", "error", "loading", "load-error"];

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const requested = (await searchParams).state;
  const state = states.includes(requested as StoreToolsScenario) ? requested as StoreToolsScenario : "loaded";
  return <StoreToolsApprovedFixture key={state} state={state} />;
}
