"use client";

import { PanelActionButton, PanelMetricCard, PanelPageHeader, PanelPageShell, PanelPanel } from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { createPanelDashboardModel } from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

export function PanelDashboardHomeView() {
  const dashboard = createPanelDashboardModel(usePanelChromeModel());
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={<PanelActionButton href="/products/new" primary>Yeni ürün</PanelActionButton>}
      />
      <div className={styles.cardGrid}>
        {dashboard.cards.map((card) => (
          <PanelMetricCard
            key={card.key}
            label={card.label}
            value={card.value}
            detail={card.detail ?? card.status}
          />
        ))}
      </div>
      <PanelPanel title="Hızlı işlemler">
        <div className={styles.actionRail}>
          {dashboard.actions.map((action) => (
            <PanelActionButton key={action.href} href={action.href}>{action.label}</PanelActionButton>
          ))}
        </div>
      </PanelPanel>
    </PanelPageShell>
  );
}
