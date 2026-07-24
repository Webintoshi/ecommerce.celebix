import { FullParityFixture } from "../full-parity-fixture";

export default async function FullParityFixtureRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <FullParityFixture pathname={`/${slug.join("/")}`} />;
}
