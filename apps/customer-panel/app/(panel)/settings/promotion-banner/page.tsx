import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

export default async function PromotionBannerSettingsPage() {
  await requireServerPanelAccess();
  redirect("/settings/design?section=promotion");
}
