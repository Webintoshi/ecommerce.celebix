import {
  PAYMENT_PROTOCOL_FAMILIES,
  type PaymentAdapterPacketSource,
  type PaymentProtocolFamily,
} from "./source-types.ts";

export { PAYMENT_PROTOCOL_FAMILIES } from "./source-types.ts";

type SourceDefinition = readonly [
  sourceSlug: string,
  familyCode: string,
  modeCode: string,
  gatewayClass: string,
  gatewayParentClass: string,
  settingsClass: string,
  settingsParentClass: string,
];

const SOURCE_DEFINITIONS = Object.freeze([
  ["akbank", "akbank", "virtual_pos", "GPOSPRO_Akbank_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Akbank_Settings", "GPOSPRO_EST_V3_Settings"],
  ["akbank-json", "akbank", "json", "GPOSPRO_Akbank_Json_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Akbank_Json_Settings", "GPOS_Gateway_Settings"],
  ["akode", "akode", "hosted", "GPOSPRO_Akode_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Akode_Settings", "GPOS_Gateway_Settings"],
  ["albaraka", "albaraka_turk", "virtual_pos", "GPOSPRO_Albaraka_Gateway", "GPOSPRO_Posnet_V1_Gateway", "GPOSPRO_Albaraka_Settings", "GPOSPRO_Posnet_V1_Settings"],
  ["craftgate", "craftgate", "orchestration", "GPOSPRO_Craftgate_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Craftgate_Settings", "GPOS_Gateway_Settings"],
  ["denizbank", "denizbank", "virtual_pos", "GPOSPRO_Denizbank_Gateway", "GPOSPRO_InterPOS_Gateway", "GPOSPRO_Denizbank_Settings", "GPOSPRO_InterPOS_Settings"],
  ["erpapay", "erpapay", "hosted", "GPOSPRO_Erpapay_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Erpapay_Settings", "GPOS_Gateway_Settings"],
  ["esnekpos", "esnekpos", "hosted", "GPOSPRO_Esnekpos_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Esnekpos_Settings", "GPOS_Gateway_Settings"],
  ["finansbank", "qnb_finansbank", "virtual_pos", "GPOSPRO_Finansbank_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Finansbank_Settings", "GPOSPRO_EST_V3_Settings"],
  ["finansbank-payfor", "qnb_finansbank", "payfor", "GPOSPRO_Finansbank_Payfor_Gateway", "GPOSPRO_Payfor_Gateway", "GPOSPRO_Finansbank_Payfor_Settings", "GPOSPRO_Payfor_Settings"],
  ["finansbank-payfor-v2", "qnb_finansbank", "payfor_v2", "GPOSPRO_Finansbank_Payfor_V2_Gateway", "GPOSPRO_Payfor_Gateway", "GPOSPRO_Finansbank_Payfor_V2_Settings", "GPOSPRO_Payfor_Settings"],
  ["garanti", "garanti_bbva", "virtual_pos", "GPOSPRO_Garanti_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Garanti_Settings", "GPOS_Gateway_Settings"],
  ["garanti-pay", "garanti_bbva", "garanti_pay", "GPOSPRO_Garanti_Pay_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Garanti_Pay_Settings", "GPOS_Gateway_Settings"],
  ["halkbank", "halkbank", "virtual_pos", "GPOSPRO_Halkbank_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Halkbank_Settings", "GPOSPRO_EST_V3_Settings"],
  ["halkbank-mkd", "halkbank", "mkd", "GPOSPRO_Halkbank_Mkd_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Halkbank_Mkd_Settings", "GPOSPRO_EST_V3_Settings"],
  ["hepsipay", "hepsipay", "wallet", "GPOSPRO_Hepsipay_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Hepsipay_Settings", "GPOS_Gateway_Settings"],
  ["is-bankasi", "is_bankasi", "virtual_pos", "GPOSPRO_Is_Bankasi_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Is_Bankasi_Settings", "GPOSPRO_EST_V3_Settings"],
  ["is-bankasi-girogate", "is_bankasi", "girogate", "GPOSPRO_Is_Bankasi_GiroGate_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Is_Bankasi_GiroGate_Settings", "GPOSPRO_EST_V3_Settings"],
  ["isyerimpos", "isyerimpos", "orchestration", "GPOSPRO_IsyerimPOS_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_IsyerimPOS_Settings", "GPOS_Gateway_Settings"],
  ["iyzico", "iyzico", "api", "GPOSPRO_Iyzico_Gateway", "GPOS_Iyzico_Gateway", "GPOSPRO_Iyzico_Settings", "GPOS_Iyzico_Settings"],
  ["iyzico-iframe", "iyzico", "iframe", "GPOSPRO_Iyzico_IFrame_Gateway", "GPOS_Iyzico_IFrame_Gateway", "GPOSPRO_Iyzico_IFrame_Settings", "GPOS_Iyzico_IFrame_Settings"],
  ["kuveyt-turk", "kuveyt_turk", "virtual_pos", "GPOSPRO_Kuveyt_Turk_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Kuveyt_Turk_Settings", "GPOS_Gateway_Settings"],
  ["lidio", "lidio", "hosted", "GPOSPRO_Lidio_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Lidio_Settings", "GPOS_Gateway_Settings"],
  ["moka", "moka", "api", "GPOSPRO_Moka_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Moka_Settings", "GPOS_Gateway_Settings"],
  ["mollie", "mollie", "hosted", "GPOSPRO_Mollie_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Mollie_Settings", "GPOS_Gateway_Settings"],
  ["ozan", "ozan", "wallet", "GPOSPRO_Ozan_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Ozan_Settings", "GPOS_Gateway_Settings"],
  ["paidora", "paidora", "hosted", "GPOSPRO_Paidora_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Paidora_Settings", "GPOS_Gateway_Settings"],
  ["papara", "papara", "api", "GPOSPRO_Papara_Gateway", "GPOS_Papara_Gateway", "GPOSPRO_Papara_Settings", "GPOS_Papara_Settings"],
  ["papara-checkout", "papara", "checkout", "GPOSPRO_Papara_Checkout_Gateway", "GPOS_Papara_Checkout_Gateway", "GPOSPRO_Papara_Checkout_Settings", "GPOS_Papara_Checkout_Settings"],
  ["papel", "papel", "wallet", "GPOSPRO_Papel_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Papel_Settings", "GPOS_Gateway_Settings"],
  ["param", "param", "hosted", "GPOSPRO_Param_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Param_Settings", "GPOS_Gateway_Settings"],
  ["paratika", "paratika", "hosted", "GPOSPRO_Paratika_Gateway", "GPOS_Paratika_Gateway", "GPOSPRO_Paratika_Settings", "GPOS_Paratika_Settings"],
  ["pay-with-iyzico", "iyzico", "pay_with_iyzico", "GPOSPRO_Pay_With_Iyzico_Gateway", "GPOS_Pay_With_Iyzico_Gateway", "GPOSPRO_Pay_With_Iyzico_Settings", "GPOS_Pay_With_Iyzico_Settings"],
  ["paybull", "paybull", "hosted", "GPOSPRO_PayBull_Gateway", "GPOSPRO_Pay_Smart_Gateway", "GPOSPRO_PayBull_Settings", "GPOSPRO_Pay_Smart_Settings"],
  ["paycell", "paycell", "wallet", "GPOSPRO_Paycell_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Paycell_Settings", "GPOS_Gateway_Settings"],
  ["paynkolay", "paynkolay", "hosted", "GPOSPRO_PayNKolay_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_PayNKolay_Settings", "GPOS_Gateway_Settings"],
  ["paytr", "paytr", "direct_api", "GPOSPRO_PayTR_Gateway", "GPOS_PayTR_IFrame_Gateway", "GPOSPRO_PayTR_Settings", "GPOS_Gateway_Settings"],
  ["paytr-iframe", "paytr", "iframe", "GPOSPRO_PayTR_IFrame_Gateway", "GPOS_PayTR_IFrame_Gateway", "GPOSPRO_PayTR_IFrame_Settings", "GPOS_PayTR_IFrame_Settings"],
  ["qnbpay", "qnbpay", "hosted", "GPOSPRO_QNBpay_Gateway", "GPOSPRO_Pay_Smart_Gateway", "GPOSPRO_QNBpay_Settings", "GPOSPRO_Pay_Smart_Settings"],
  ["rubikpara", "rubikpara", "hosted", "GPOSPRO_Rubikpara_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Rubikpara_Settings", "GPOS_Gateway_Settings"],
  ["sekerbank", "sekerbank", "virtual_pos", "GPOSPRO_Sekerbank_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Sekerbank_Settings", "GPOSPRO_EST_V3_Settings"],
  ["setcard", "setcard", "meal_card", "GPOSPRO_Setcard_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Setcard_Settings", "GPOS_Gateway_Settings"],
  ["shopier", "shopier", "hosted", "GPOSPRO_Shopier_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Shopier_Settings", "GPOS_Gateway_Settings"],
  ["sipay", "sipay", "hosted", "GPOSPRO_Sipay_Gateway", "GPOSPRO_Pay_Smart_Gateway", "GPOSPRO_Sipay_Settings", "GPOSPRO_Pay_Smart_Settings"],
  ["tami", "tami", "hosted", "GPOSPRO_Tami_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Tami_Settings", "GPOS_Gateway_Settings"],
  ["teb", "teb", "virtual_pos", "GPOSPRO_Teb_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Teb_Settings", "GPOSPRO_EST_V3_Settings"],
  ["united-payment", "united_payment", "hosted", "GPOSPRO_United_Payment_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_United_Payment_Settings", "GPOS_Gateway_Settings"],
  ["vakif-katilim", "vakif_katilim", "virtual_pos", "GPOSPRO_Vakif_Katilim_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Vakif_Katilim_Settings", "GPOS_Gateway_Settings"],
  ["vakifbank", "vakifbank", "virtual_pos", "GPOSPRO_VakifBank_Gateway", "GPOSPRO_PayFlex_V4_Gateway", "GPOSPRO_VakifBank_Settings", "GPOSPRO_PayFlex_V4_Settings"],
  ["vallet", "vallet", "hosted", "GPOSPRO_Vallet_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Vallet_Settings", "GPOS_Gateway_Settings"],
  ["vepara", "vepara", "hosted", "GPOSPRO_Vepara_Gateway", "GPOSPRO_Pay_Smart_Gateway", "GPOSPRO_Vepara_Settings", "GPOSPRO_Pay_Smart_Settings"],
  ["weepay", "weepay", "hosted", "GPOSPRO_Weepay_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Weepay_Settings", "GPOS_Gateway_Settings"],
  ["worldpay", "worldpay", "hosted", "GPOSPRO_WorldPAY_Gateway", "GPOSPRO_Posnet_Gateway", "GPOSPRO_WorldPAY_Settings", "GPOSPRO_Posnet_Settings"],
  ["wyld", "wyld", "hosted", "GPOSPRO_Wyld_Gateway", "GPOS_Payment_Gateway", "GPOSPRO_Wyld_Settings", "GPOS_Gateway_Settings"],
  ["yapi-kredi", "yapi_kredi", "virtual_pos", "GPOSPRO_Yapi_Kredi_Gateway", "GPOSPRO_Posnet_Gateway", "GPOSPRO_Yapi_Kredi_Settings", "GPOSPRO_Posnet_Settings"],
  ["ziraat", "ziraat_bankasi", "virtual_pos", "GPOSPRO_Ziraat_Gateway", "GPOSPRO_EST_V3_Gateway", "GPOSPRO_Ziraat_Settings", "GPOSPRO_EST_V3_Settings"],
  ["ziraat-katilim", "ziraat_katilim", "virtual_pos", "GPOSPRO_Ziraat_Katilim_Gateway", "GPOSPRO_Payfor_Gateway", "GPOSPRO_Ziraat_Katilim_Settings", "GPOSPRO_Payfor_Settings"],
  ["ziraatpay", "ziraatpay", "hosted", "GPOSPRO_ZiraatPay_Gateway", "GPOS_Payten_Gateway", "GPOSPRO_ZiraatPay_Settings", "GPOS_Payten_Settings"],
] satisfies readonly SourceDefinition[]);

const EST_V3 = new Set([
  "akbank", "akbank-json", "finansbank", "halkbank", "halkbank-mkd", "is-bankasi",
  "is-bankasi-girogate", "sekerbank", "teb", "ziraat",
]);
const PAYFOR = new Set(["finansbank-payfor", "finansbank-payfor-v2", "ziraat-katilim"]);
const POSNET = new Set(["worldpay", "yapi-kredi"]);
const PAY_SMART = new Set(["paybull", "qnbpay", "sipay", "vepara"]);
const BASE_PLUGIN = new Set([
  "iyzico", "iyzico-iframe", "papara", "papara-checkout", "paratika",
  "pay-with-iyzico", "paytr-iframe",
]);

const PARENT_CLASS_SOURCE_PATHS = Object.freeze({
  GPOS_Payment_Gateway: "includes/abstracts/abstract-gpos-payment-gateway.php",
  GPOS_Gateway_Settings: "includes/abstracts/abstract-gpos-gateway-settings.php",
  GPOS_Payten_Gateway: "includes/abstracts/payten-gateway/abstract-gpos-payten-gateway.php",
  GPOS_Payten_Settings: "includes/abstracts/payten-gateway/abstract-gpos-payten-settings.php",
  GPOSPRO_EST_V3_Gateway: "includes/abstracts/est-v3/abstract-gpospro-est-v3-gateway.php",
  GPOSPRO_EST_V3_Settings: "includes/abstracts/est-v3/abstract-gpospro-est-v3-settings.php",
  GPOSPRO_InterPOS_Gateway: "includes/abstracts/interpos/abstract-gpospro-interpos-gateway.php",
  GPOSPRO_InterPOS_Settings: "includes/abstracts/interpos/abstract-gpospro-interpos-settings.php",
  GPOSPRO_Pay_Smart_Gateway: "includes/abstracts/pay-smart/abstract-gpospro-pay-smart-gateway.php",
  GPOSPRO_Pay_Smart_Settings: "includes/abstracts/pay-smart/abstract-gpospro-pay-smart-settings.php",
  GPOSPRO_PayFlex_V4_Gateway: "includes/abstracts/payflex-v4/abstract-gpospro-payflex-v4-gateway.php",
  GPOSPRO_PayFlex_V4_Settings: "includes/abstracts/payflex-v4/abstract-gpospro-payflex-v4-settings.php",
  GPOSPRO_Payfor_Gateway: "includes/abstracts/payfor/abstract-gpospro-payfor-gateway.php",
  GPOSPRO_Payfor_Settings: "includes/abstracts/payfor/abstract-gpospro-payfor-settings.php",
  GPOSPRO_Posnet_Gateway: "includes/abstracts/posnet/abstract-gpospro-posnet-gateway.php",
  GPOSPRO_Posnet_Settings: "includes/abstracts/posnet/abstract-gpospro-posnet-settings.php",
  GPOSPRO_Posnet_V1_Gateway: "includes/abstracts/posnet-v1/abstract-gpospro-posnet-v1-gateway.php",
  GPOSPRO_Posnet_V1_Settings: "includes/abstracts/posnet-v1/abstract-gpospro-posnet-v1-settings.php",
  GPOS_Iyzico_Gateway: "includes/payment-gateways/iyzico/class-gpos-iyzico-gateway.php",
  GPOS_Iyzico_Settings: "includes/payment-gateways/iyzico/class-gpos-iyzico-settings.php",
  GPOS_Iyzico_IFrame_Gateway: "includes/payment-gateways/iyzico-iframe/class-gpos-iyzico-iframe-gateway.php",
  GPOS_Iyzico_IFrame_Settings: "includes/payment-gateways/iyzico-iframe/class-gpos-iyzico-iframe-settings.php",
  GPOS_Papara_Gateway: "includes/payment-gateways/papara/class-gpos-papara-gateway.php",
  GPOS_Papara_Settings: "includes/payment-gateways/papara/class-gpos-papara-settings.php",
  GPOS_Papara_Checkout_Gateway: "includes/payment-gateways/papara-checkout/class-gpos-papara-checkout-gateway.php",
  GPOS_Papara_Checkout_Settings: "includes/payment-gateways/papara-checkout/class-gpos-papara-checkout-settings.php",
  GPOS_Paratika_Gateway: "includes/payment-gateways/paratika/class-gpos-paratika-gateway.php",
  GPOS_Paratika_Settings: "includes/payment-gateways/paratika/class-gpos-paratika-settings.php",
  GPOS_Pay_With_Iyzico_Gateway: "includes/payment-gateways/pay-with-iyzico/class-gpos-pay-with-iyzico-gateway.php",
  GPOS_Pay_With_Iyzico_Settings: "includes/payment-gateways/pay-with-iyzico/class-gpos-pay-with-iyzico-settings.php",
  GPOS_PayTR_IFrame_Gateway: "includes/payment-gateways/paytr-iframe/class-gpos-paytr-iframe-gateway.php",
  GPOS_PayTR_IFrame_Settings: "includes/payment-gateways/paytr-iframe/class-gpos-paytr-iframe-settings.php",
} as const);

const OFFICIAL_DOCUMENTATION_CANDIDATES = Object.freeze({
  akbank: "https://www.akbank.com/bankamiz/reklamlar",
  akode: "https://www.akodepos.com/",
  albaraka_turk: "https://www.albaraka.com.tr/",
  craftgate: "https://craftgate.io/basin",
  denizbank: "https://www.denizbank.com/hakkimizda/medya-merkezi/logo",
  erpapay: "https://www.erpapay.com/",
  esnekpos: "https://developer-eng.esnekpos.com/esnekpos-developer-environment/home-page",
  qnb_finansbank: "https://www.qnb.com.tr/qnbyi-taniyin/basin-odasi/logolar-ve-diger-gorseller",
  garanti_bbva: "https://www.garantibbva.com.tr/",
  halkbank: "https://www.halkbank.com.tr/",
  hepsipay: "https://www.hepsipay.com/",
  is_bankasi: "https://www.isbank.com.tr/",
  isyerimpos: "https://www.isyerimpos.com/",
  iyzico: "https://www.iyzico.com/",
  kuveyt_turk: "https://www.kuveytturk.com.tr/",
  lidio: "https://www.lidio.com/",
  moka: "https://www.mokaunited.com/",
  mollie: "https://www.mollie.com/",
  ozan: "https://www.ozan.com/",
  paidora: "https://paidora-soft.com/",
  papara: "https://www.papara.com/en/about-us",
  papel: "https://www.papel.com.tr/",
  param: "https://param.com.tr/",
  paratika: "https://www.paratika.com.tr/",
  paybull: "https://paybull.com/",
  paycell: "https://paycell.com.tr/kurumsal",
  paynkolay: "https://paynkolay.com.tr/",
  paytr: "https://www.paytr.com/",
  qnbpay: "https://www.qnbpay.com.tr/en/support/security-information",
  rubikpara: "https://rubikpara.com/",
  sekerbank: "https://www.sekerbank.com.tr/",
  setcard: "https://www.setcard.com.tr/",
  shopier: "https://www.shopier.com/hakkimizda",
  sipay: "https://sipay.com.tr/",
  tami: "https://www.tami.com.tr/",
  teb: "https://www.teb.com.tr/",
  united_payment: "https://www.mokaunited.com/",
  vakif_katilim: "https://www.vakifkatilim.com.tr/",
  vakifbank: "https://www.vakifbank.com.tr/",
  vallet: "https://www.vallet.com.tr/",
  vepara: "https://www.vepara.com.tr/",
  weepay: "https://www.weepay.co/",
  worldpay: "https://www.worldpay.com/",
  wyld: "https://www.wyld.com.tr/",
  yapi_kredi: "https://www.yapikredi.com.tr/",
  ziraat_bankasi: "https://www.ziraatbank.com.tr/",
  ziraat_katilim: "https://www.ziraatkatilim.com.tr/",
  ziraatpay: "https://www.ziraatpay.com.tr/hakkimizda-zp/Sayfalar/ortaklik-yapisi-ve-iletisim-bilgileri.aspx",
} as const);

const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PHP_CLASS = /^GPOS(?:PRO)?_[A-Za-z0-9_]+$/;
const SOURCE_PATH =
  /^includes\/(?:payment-gateways|abstracts)\/[a-z0-9]+(?:[/-][a-z0-9]+)*\.php$/;

function protocolFamily(sourceSlug: string): PaymentProtocolFamily {
  if (EST_V3.has(sourceSlug)) return "est_v3";
  if (PAYFOR.has(sourceSlug)) return "payfor";
  if (POSNET.has(sourceSlug)) return "posnet";
  if (sourceSlug === "albaraka") return "posnet_v1";
  if (PAY_SMART.has(sourceSlug)) return "pay_smart";
  if (sourceSlug === "vakifbank") return "payflex_v4";
  if (sourceSlug === "denizbank") return "interpos";
  if (BASE_PLUGIN.has(sourceSlug)) return "base_plugin";
  return "provider_specific";
}

function sourcePathForParent(parentClass: string): string {
  const sourcePath = PARENT_CLASS_SOURCE_PATHS[
    parentClass as keyof typeof PARENT_CLASS_SOURCE_PATHS
  ];
  if (!sourcePath) throw new TypeError("payment_adapter_source_inventory_invalid");
  return sourcePath;
}

function defineSource(definition: SourceDefinition): PaymentAdapterPacketSource {
  const [
    sourceSlug,
    familyCode,
    modeCode,
    gatewayClass,
    gatewayParentClass,
    settingsClass,
    settingsParentClass,
  ] = definition;
  const providerCode = sourceSlug.replaceAll("-", "_");
  const gatewaySourcePath =
    `includes/payment-gateways/${sourceSlug}/class-gpospro-${sourceSlug}-gateway.php`;
  const settingsSourcePath =
    `includes/payment-gateways/${sourceSlug}/class-gpospro-${sourceSlug}-settings.php`;
  const inheritanceSourcePaths = Object.freeze([
    ...new Set([
      sourcePathForParent(gatewayParentClass),
      sourcePathForParent(settingsParentClass),
    ]),
  ]);
  const documentationCandidate =
    OFFICIAL_DOCUMENTATION_CANDIDATES[
      familyCode as keyof typeof OFFICIAL_DOCUMENTATION_CANDIDATES
    ];

  if (
    !SLUG.test(sourceSlug) ||
    sourceSlug === "dummy-payment" ||
    !CODE.test(providerCode) ||
    !CODE.test(familyCode) ||
    !CODE.test(modeCode) ||
    !PHP_CLASS.test(gatewayClass) ||
    !PHP_CLASS.test(gatewayParentClass) ||
    !PHP_CLASS.test(settingsClass) ||
    !PHP_CLASS.test(settingsParentClass) ||
    !SOURCE_PATH.test(gatewaySourcePath) ||
    !SOURCE_PATH.test(settingsSourcePath) ||
    inheritanceSourcePaths.some((sourcePath) => !SOURCE_PATH.test(sourcePath)) ||
    !documentationCandidate ||
    new URL(documentationCandidate).protocol !== "https:"
  ) {
    throw new TypeError("payment_adapter_source_inventory_invalid");
  }

  return Object.freeze({
    providerCode,
    familyCode,
    modeCode,
    sourceSlug,
    gatewayClass,
    gatewayParentClass,
    settingsClass,
    settingsParentClass,
    protocolFamily: protocolFamily(sourceSlug),
    pluginVersion: "2.6.73",
    basePluginVersion: "3.8.1",
    implementationState: providerCode === "paytr_iframe"
      ? "executable"
      : providerCode === "iyzico_iframe"
        ? "configurable"
        : "inventory_only",
    gatewaySourcePath,
    settingsSourcePath,
    inheritanceSourcePaths,
    officialDocumentationCandidates: Object.freeze([documentationCandidate]),
  });
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const inventory = SOURCE_DEFINITIONS.map(defineSource);
const identityCodes = inventory.map(
  ({ providerCode, familyCode, modeCode, sourceSlug }) =>
    `${providerCode}/${familyCode}/${modeCode}/${sourceSlug}`,
);
const familyModes = inventory.map(({ familyCode, modeCode }) => `${familyCode}/${modeCode}`);
const sourceSlugs = inventory.map(({ sourceSlug }) => sourceSlug);
const sortedSourceSlugs = [...sourceSlugs].sort();

if (
  inventory.length !== 58 ||
  !unique(inventory.map(({ providerCode }) => providerCode)) ||
  !unique(inventory.map(({ sourceSlug }) => sourceSlug)) ||
  !unique(inventory.flatMap(({ gatewayClass, settingsClass }) => [gatewayClass, settingsClass])) ||
  !unique(inventory.map(({ gatewaySourcePath }) => gatewaySourcePath)) ||
  !unique(inventory.map(({ settingsSourcePath }) => settingsSourcePath)) ||
  !unique(familyModes) ||
  !unique(identityCodes) ||
  sourceSlugs.some((sourceSlug, index) => sourceSlug !== sortedSourceSlugs[index]) ||
  inventory.some(({ protocolFamily: family }) => !PAYMENT_PROTOCOL_FAMILIES.includes(family))
) {
  throw new TypeError("payment_adapter_source_inventory_invalid");
}

export const PAYMENT_ADAPTER_PACKET_INVENTORY: readonly PaymentAdapterPacketSource[] =
  Object.freeze(inventory);

const SOURCE_BY_PROVIDER = new Map(
  PAYMENT_ADAPTER_PACKET_INVENTORY.map((source) => [source.providerCode, source]),
);

export function getPaymentAdapterPacketSource(
  providerCode: string,
): PaymentAdapterPacketSource | null {
  return SOURCE_BY_PROVIDER.get(providerCode) ?? null;
}
