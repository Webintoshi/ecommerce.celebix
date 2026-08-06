export interface PanelPublicChromeModel {
  readonly storeSlug: string;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
}

export interface PanelClientStoreOption {
  readonly selectionKey: string;
  readonly displayName: string;
}

export interface PanelClientChromeModel extends PanelPublicChromeModel {
  readonly analyticsAvailable: boolean;
  readonly activeStoreSelectionKey?: string;
  readonly storeOptions?: readonly PanelClientStoreOption[];
}
