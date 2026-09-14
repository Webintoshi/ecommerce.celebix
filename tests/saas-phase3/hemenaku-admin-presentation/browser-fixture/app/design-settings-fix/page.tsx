import { readFixture } from "./fixture-store";
import { DesignFixFixture } from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() { return <DesignFixFixture workspace={await readFixture()} />; }
