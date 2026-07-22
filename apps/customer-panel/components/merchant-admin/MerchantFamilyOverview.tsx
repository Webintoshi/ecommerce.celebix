import Link from "next/link";

import { PanelPageShell } from "@/components/panel/PanelPageShell";
import {
  MERCHANT_MODULE_DEFINITIONS,
  type MerchantModuleFamily,
} from "@/lib/merchant-admin-ui/presentation";

export function MerchantFamilyOverview({ family, canManage }: Readonly<{
  family: MerchantModuleFamily;
  canManage: boolean;
}>) {
  const definitions = MERCHANT_MODULE_DEFINITIONS.filter((definition) => definition.family === family);

  return <PanelPageShell>{definitions.map((definition) => (
    <Link key={definition.kind} href={definition.route}>
      <strong>{definition.title}</strong><span>{definition.description}</span>
      <small>{canManage ? "Yönet" : "Görüntüle"}</small>
    </Link>
  ))}</PanelPageShell>;
}
