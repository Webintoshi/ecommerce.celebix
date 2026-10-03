import { SidebarApprovedFixture, type SidebarScenario } from "./screen";

const scenarios: readonly SidebarScenario[] = ["logo", "no-logo", "broken-logo", "long-name", "multi", "cashier"];

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; scenario?: string }> }) {
  const query = await searchParams;
  const requested = query.state ?? query.scenario;
  const state = scenarios.includes(requested as SidebarScenario) ? requested as SidebarScenario : "logo";
  return <SidebarApprovedFixture key={state} state={state} />;
}
