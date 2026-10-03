import { ContactToolsFixture } from "../ContactToolsFixture";
export default async function Page({ searchParams }: { searchParams: Promise<{ theme?: string }> }) { return <ContactToolsFixture theme={(await searchParams).theme} checkout />; }
