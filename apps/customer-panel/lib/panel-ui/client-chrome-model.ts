export interface PanelPublicChromeModel {
  readonly storeSlug: string;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
}

export interface PanelClientChromeModel extends PanelPublicChromeModel {
  readonly analyticsAvailable: boolean;
  readonly activeStoreId?: string;
  readonly storeOptions?: readonly import("../panel-store-options/postgres-repository").PanelStoreOption[];
}
