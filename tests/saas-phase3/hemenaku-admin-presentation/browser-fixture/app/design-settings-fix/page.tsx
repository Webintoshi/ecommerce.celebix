import { readFixture } from "./fixture-store";
import { DesignFixFixture } from "./workspace";
import { designFixturePreviewResources } from "./preview-resources";
export const dynamic = "force-dynamic";
export default async function Page() { const workspace = await readFixture(); return <DesignFixFixture workspace={workspace} initialPreviewResources={await designFixturePreviewResources(workspace)} />; }
