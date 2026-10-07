import { GoogleMarketingFixtureScreen } from "./screen";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <GoogleMarketingFixtureScreen scenario={typeof query.scenario === "string" ? query.scenario : "normal"} />;
}
