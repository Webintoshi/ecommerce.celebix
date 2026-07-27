export const PAYMENT_PROTOCOL_FAMILIES = Object.freeze([
  "est_v3",
  "payfor",
  "posnet",
  "posnet_v1",
  "pay_smart",
  "payflex_v4",
  "interpos",
  "provider_specific",
  "base_plugin",
] as const);

export type PaymentProtocolFamily = (typeof PAYMENT_PROTOCOL_FAMILIES)[number];

export type PaymentAdapterPacketSource = Readonly<{
  providerCode: string;
  familyCode: string;
  modeCode: string;
  sourceSlug: string;
  gatewayClass: string;
  gatewayParentClass: string;
  settingsClass: string;
  settingsParentClass: string;
  protocolFamily: PaymentProtocolFamily;
  pluginVersion: "2.6.73";
  basePluginVersion: "3.8.1";
  implementationState: "inventory_only" | "executable";
  gatewaySourcePath: string;
  settingsSourcePath: string;
  inheritanceSourcePaths: readonly string[];
  officialDocumentationCandidates: readonly string[];
}>;
