import { AnalyticsFixtureScreen } from "./AnalyticsFixtureScreen";

const TABS = new Set(["overview", "funnel", "carts", "acquisition", "products"]);
const RANGES = new Set(["today", "7d", "30d", "90d"]);

export default async function AnalyticsFixturePage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const query = await searchParams;
  const tab = (typeof query.tab === "string" && TABS.has(query.tab) ? query.tab : "overview") as "overview" | "funnel" | "carts" | "acquisition" | "products";
  const customFrom = typeof query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : undefined;
  const customTo = typeof query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : undefined;
  const range = (customFrom && customTo ? "custom" : typeof query.range === "string" && RANGES.has(query.range) ? query.range : "30d") as "today" | "7d" | "30d" | "90d" | "custom";
  return <AnalyticsFixtureScreen tab={tab} range={range} compare={query.compare === "1"} customFrom={customFrom} customTo={customTo} initialTimezone={typeof query.timezone === "string" ? query.timezone : undefined} />;
}
