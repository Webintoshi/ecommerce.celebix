import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import {
  PanelActionButton,
} from "@/components/panel/PanelPageShell";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CUSTOMER_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import styles from "./customer-console.module.css";

export function CustomerWorkspace({
  canManage,
  children,
}: Readonly<{
  canManage: boolean;
  children: ReactNode;
}>) {
  return (
    <PanelWorkspaceShell
      title="Müşteriler"
      description="Müşteri kayıtlarını, izinleri, etiketleri ve segmentleri tek yerden yönetin."
      tabs={CUSTOMER_WORKSPACE_TABS}
      actions={canManage ? (
        <span className={styles.workspacePrimaryAction}>
          <PanelActionButton primary href="/customers/new">
            <Plus aria-hidden="true" /> Yeni müşteri
          </PanelActionButton>
        </span>
      ) : undefined}
    >
      {children}
    </PanelWorkspaceShell>
  );
}
