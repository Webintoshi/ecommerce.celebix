import { SettingsFixtureScreen } from "../SettingsFixtureScreen";

export default async function MiraSettingsFixturePage({ params }: Readonly<{ params: Promise<{ view: string }> }>) {
  const { view } = await params;
  return <SettingsFixtureScreen view={view} />;
}
