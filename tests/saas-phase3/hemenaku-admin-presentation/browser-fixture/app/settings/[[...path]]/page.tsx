import { notFound, redirect } from "next/navigation";
import { SettingsFixtureScreen } from "../../mira-settings/SettingsFixtureScreen";
import { readFixture } from "../../design-settings-fix/fixture-store";
import { designFixturePreviewResources } from "../../design-settings-fix/preview-resources";
import { DesignFixFixture } from "../../design-settings-fix/workspace";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? [];
  if (path[0] === "design") {
    const workspace = await readFixture();
    return <DesignFixFixture workspace={workspace} initialPreviewResources={await designFixturePreviewResources(workspace)} settingsRoute />;
  }
  if (["theme", "hero-banner", "promotion-banner", "marquee", "category-showcase"].includes(path[0])) redirect("/settings/design");
  const view = path.length === 0 ? "settings" : path[0] === "administrators" && path[1] === "new" ? "administrator-new" : path[0] === "administrators" && path[2] === "edit" ? "administrator-edit" : path[0];
  if (!["settings", "general", "language", "notifications", "administrators", "administrator-new", "administrator-edit", "domains", "payment", "shipping", "pricing", "analytics", "artificial-intelligence"].includes(view)) notFound();
  return <SettingsFixtureScreen view={view} />;
}
