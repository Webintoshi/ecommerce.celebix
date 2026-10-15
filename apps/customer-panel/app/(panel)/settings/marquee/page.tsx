import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

export default async function MarqueeSettingsPage() {
  await requireServerPanelAccess();
  redirect("/settings/design?section=announcement");
}
