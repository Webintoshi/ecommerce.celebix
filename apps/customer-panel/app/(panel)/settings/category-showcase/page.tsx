import { redirect } from "next/navigation";

import { requireServerPanelAccess } from "@/lib/server-access";

export default async function CategoryShowcaseSettingsPage() {
  await requireServerPanelAccess();
  redirect("/settings/design?section=theme");
}
