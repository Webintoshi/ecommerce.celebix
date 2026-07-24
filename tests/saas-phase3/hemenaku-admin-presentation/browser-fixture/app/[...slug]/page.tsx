import { FullParityFixture } from "../full-parity-fixture";

export default async function FullParityFixtureRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ state?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const state = ["loaded", "empty", "loading", "error", "unavailable", "denied", "conflict", "replayed", "verification_unavailable"].includes(query.state ?? "")
    ? query.state as "loaded" | "empty" | "loading" | "error" | "unavailable" | "denied" | "conflict" | "replayed" | "verification_unavailable"
    : "loaded";
  return <FullParityFixture pathname={`/${slug.join("/")}`} state={state} />;
}
