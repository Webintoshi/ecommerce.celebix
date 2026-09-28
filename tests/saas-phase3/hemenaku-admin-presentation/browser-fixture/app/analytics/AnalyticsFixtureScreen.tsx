"use client";

import type { ComponentProps } from "react";
import { CommerceAnalyticsWorkspace } from "@/components/analytics/CommerceAnalyticsWorkspace";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../mira-catalog/catalog-fixture";

export function AnalyticsFixtureScreen(props: ComponentProps<typeof CommerceAnalyticsWorkspace>) {
  return <PanelLayoutClient model={{ ...MODEL, analyticsAvailable: true, storeSlug: "mira-analytics-fixture" }}><CommerceAnalyticsWorkspace {...props} /></PanelLayoutClient>;
}
