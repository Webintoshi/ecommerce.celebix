"use client";

import type { StorefrontPolicyKey } from "@celebix/saas-contracts";
import { PolicyConsole } from "@/components/content/PolicyConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { CONTENT_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";

import { MODEL } from "../mira-catalog/catalog-fixture";

export function PolicyFixtureScreen({ initialPolicyKey, canManage, recoveryScope }: Readonly<{
  initialPolicyKey?: StorefrontPolicyKey;
  canManage: boolean;
  recoveryScope?: string;
}>) {
  return (
    <PanelLayoutClient model={MODEL}>
      <PanelWorkspaceShell title="İçerik" tabs={CONTENT_WORKSPACE_TABS}>
        <PolicyConsole initialPolicyKey={initialPolicyKey} canManage={canManage} recoveryScope={recoveryScope} embedded />
      </PanelWorkspaceShell>
    </PanelLayoutClient>
  );
}
