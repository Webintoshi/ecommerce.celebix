import { AnalyticsPolishFixtureScreen, type AnalyticsPolishState } from "./screen";

const STATES = new Set(["loss", "cart", "missing", "zero", "loading", "error"]);

export default async function AnalyticsPolishFixturePage({ searchParams }: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const state = typeof params.state === "string" && STATES.has(params.state) ? params.state : "loss";
  return <AnalyticsPolishFixtureScreen state={state as AnalyticsPolishState} />;
}
