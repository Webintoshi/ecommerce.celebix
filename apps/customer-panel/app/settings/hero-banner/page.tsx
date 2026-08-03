import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

export default async function HeroBannerSettingsPage() {
  await requireServerPanelAccess();
  redirect("/settings/design?section=hero");
}
