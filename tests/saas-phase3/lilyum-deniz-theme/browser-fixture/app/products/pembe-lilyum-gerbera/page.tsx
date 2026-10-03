import { ContactToolsFixture } from "../../ContactToolsFixture";
export default async function Page({ searchParams }: { searchParams: Promise<{ theme?: string; appearance?: string; left?: string }> }) { const query = await searchParams; return <ContactToolsFixture theme={query.theme} appearance={query.appearance} left={query.left === "1"} productPage />; }
