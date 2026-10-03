import { RequiredPagesFixture } from "../../../../mira-required-pages/screen";
import { requiredPagesScenario } from "../../../../mira-required-pages/fixture-transport";

export default async function Page({ params, searchParams }: { params: Promise<{ recordId: string }>; searchParams: Promise<{ state?: string }> }) {
  const [{ recordId }, query] = await Promise.all([params, searchParams]);
  const state = requiredPagesScenario(query.state);
  return <RequiredPagesFixture key={`${state}:${recordId}`} state={state} view="edit" recordId={recordId} />;
}
