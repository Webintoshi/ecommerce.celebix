import { ReferencePricingFixtureScreen } from "../ReferencePricingFixtureScreen";

export default async function ReferencePricingFixturePage({ params }: Readonly<{ params: Promise<{ view: string }> }>) {
  const { view } = await params;
  return <ReferencePricingFixtureScreen view={view} />;
}
