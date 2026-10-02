import { PosApprovedFixture } from "./screen";
import { POS_SCENARIOS, type PosScenario } from "./fixture-transport";

export default async function Page({ searchParams }: { searchParams: Promise<{ scenario?: string; mutation?: string }> }) {
  const query = await searchParams;
  const scenario = POS_SCENARIOS.includes(query.scenario as PosScenario) ? query.scenario as PosScenario : "filled";
  return <PosApprovedFixture key={`${scenario}:${query.mutation ?? ""}`} scenario={scenario} mutation={query.mutation ?? ""} />;
}
