export interface PanelPublicChromeModel {
  readonly storeSlug: string;
  readonly storeDisplayName?: string;
  readonly storeLogoUrl?: string | null;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
  readonly navigationMode?: "register";
  readonly cashierOrdersAvailable?: boolean;
  readonly cashierAccountingAvailable?: boolean;
  readonly accountingCommissionsAvailable?: boolean;
}

export interface PanelClientStoreOption {
  readonly selectionKey: string;
  readonly displayName: string;
}

export interface PanelClientChromeModel extends PanelPublicChromeModel {
  readonly analyticsAvailable: boolean;
  readonly staffManagementAvailable?: boolean;
  readonly activeStoreSelectionKey?: string;
  readonly storeOptions?: readonly PanelClientStoreOption[];
  readonly lockedNavigationHrefs?: readonly string[];
}
