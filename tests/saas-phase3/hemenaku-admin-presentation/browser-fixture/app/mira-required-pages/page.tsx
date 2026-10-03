import { RequiredPagesFixture } from "./screen";
import { REQUIRED_PAGE_IDS, requiredPagesScenario } from "./fixture-transport";

export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; view?: string; page?: string }> }) {
  const query = await searchParams;
  const state = requiredPagesScenario(query.state);
  const key = Object.hasOwn(REQUIRED_PAGE_IDS, query.page ?? "") ? query.page as keyof typeof REQUIRED_PAGE_IDS : "about";
  const view = query.view === "edit" || query.view === "new" ? query.view : "list";
  return <RequiredPagesFixture key={`${state}:${view}:${key}`} state={state} view={view} recordId={REQUIRED_PAGE_IDS[key]} />;
}
