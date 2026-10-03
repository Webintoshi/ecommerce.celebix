import { RequiredPagesFixture } from "../../mira-required-pages/screen";
import { requiredPagesScenario } from "../../mira-required-pages/fixture-transport";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const state = requiredPagesScenario((await searchParams).state);
  return <RequiredPagesFixture key={state} state={state} />;
}
