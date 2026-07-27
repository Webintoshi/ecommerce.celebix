import type {
  PaymentProviderCatalogEntry,
  PaymentProviderCategory,
  PaymentProviderInteractionMode,
} from "@celebix/saas-contracts";

type RawEntry = Readonly<{
  sourceSlug: string;
  familyCode: string;
  modeCode: string;
  label: string;
  modeLabel: string;
  category: PaymentProviderCategory;
  interactionMode: Exclude<PaymentProviderInteractionMode, "offline">;
  aliases?: readonly string[];
}>;

const UNKNOWN_SUPPORT = Object.freeze({
  threeDSecure: "unknown",
  installments: "unknown",
  refund: "unknown",
  cancel: "unknown",
  capture: "unknown",
} as const);
const LIVE_ONLY = Object.freeze(["live"] as const);
const RASTER_LOGO_FAMILIES = new Set(["erpapay", "paycell", "rubikpara", "vepara"]);

function define(input: RawEntry): PaymentProviderCatalogEntry {
  const logoExtension = RASTER_LOGO_FAMILIES.has(input.familyCode) ? "png" : "svg";
  return Object.freeze({
    providerCode: input.sourceSlug.replaceAll("-", "_"),
    familyCode: input.familyCode,
    modeCode: input.modeCode,
    sourceSlug: input.sourceSlug,
    label: input.label,
    modeLabel: input.modeLabel,
    category: input.category,
    interactionMode: input.interactionMode,
    readiness: "planned",
    support: UNKNOWN_SUPPORT,
    logoPath: `/payment-providers/${input.familyCode}.${logoExtension}`,
    aliases: Object.freeze([...(input.aliases ?? [])]),
    environments: LIVE_ONLY,
  });
}

function bank(
  sourceSlug: string,
  familyCode: string,
  label: string,
  modeCode = "virtual_pos",
  modeLabel = "Sanal POS",
  interactionMode: Exclude<PaymentProviderInteractionMode, "offline"> = "direct_pos",
  aliases: readonly string[] = [],
) {
  return define({ sourceSlug, familyCode, modeCode, label, modeLabel, interactionMode, aliases, category: "bank_pos" });
}

function hosted(
  sourceSlug: string,
  familyCode: string,
  label: string,
  modeCode = "hosted",
  modeLabel = "Hosted Ödeme",
  aliases: readonly string[] = [],
  category: PaymentProviderCategory = "payment_institution",
) {
  return define({ sourceSlug, familyCode, modeCode, label, modeLabel, aliases, category, interactionMode: "redirect" });
}

function tokenized(
  sourceSlug: string,
  familyCode: string,
  label: string,
  modeCode: string,
  modeLabel: string,
  aliases: readonly string[] = [],
) {
  return define({ sourceSlug, familyCode, modeCode, label, modeLabel, aliases, category: "payment_institution", interactionMode: "tokenized" });
}

function wallet(
  sourceSlug: string,
  familyCode: string,
  label: string,
  modeCode = "wallet",
  modeLabel = "Dijital Cüzdan",
  aliases: readonly string[] = [],
) {
  return define({ sourceSlug, familyCode, modeCode, label, modeLabel, aliases, category: "wallet", interactionMode: "wallet" });
}

export const RAW_PAYMENT_PROVIDER_CATALOG = Object.freeze([
  bank("akbank", "akbank", "Akbank"),
  bank("akbank-json", "akbank", "Akbank", "json", "JSON API"),
  hosted("akode", "akode", "AkÖde", "hosted", "Hosted Ödeme", ["ak ode"]),
  bank("albaraka", "albaraka_turk", "Albaraka Türk", "virtual_pos", "Sanal POS", "direct_pos", ["albaraka"]),
  tokenized("craftgate", "craftgate", "Craftgate", "orchestration", "Ödeme Orkestrasyonu"),
  bank("denizbank", "denizbank", "DenizBank"),
  hosted("erpapay", "erpapay", "ErpaPay"),
  hosted("esnekpos", "esnekpos", "EsnekPos"),
  bank("finansbank", "qnb_finansbank", "QNB Finansbank", "virtual_pos", "Sanal POS", "direct_pos", ["qnb", "finansbank"]),
  bank("finansbank-payfor", "qnb_finansbank", "QNB Finansbank", "payfor", "PayFor", "redirect", ["qnb payfor"]),
  bank("finansbank-payfor-v2", "qnb_finansbank", "QNB Finansbank", "payfor_v2", "PayFor v2", "redirect", ["qnb payfor"]),
  bank("garanti", "garanti_bbva", "Garanti BBVA", "virtual_pos", "Sanal POS", "direct_pos", ["garanti"]),
  bank("garanti-pay", "garanti_bbva", "Garanti BBVA", "garanti_pay", "GarantiPay", "wallet", ["garanti pay"]),
  bank("halkbank", "halkbank", "Halkbank"),
  bank("halkbank-mkd", "halkbank", "Halkbank", "mkd", "MKD"),
  wallet("hepsipay", "hepsipay", "Hepsipay", "wallet", "Dijital Cüzdan", ["hepsi pay"]),
  bank("is-bankasi", "is_bankasi", "Türkiye İş Bankası", "virtual_pos", "Sanal POS", "direct_pos", ["iş bankası", "is bankasi"]),
  bank("is-bankasi-girogate", "is_bankasi", "Türkiye İş Bankası", "girogate", "Girogate", "redirect", ["iş bankası", "is bankasi"]),
  tokenized("isyerimpos", "isyerimpos", "İşyerimPOS", "orchestration", "Ödeme Orkestrasyonu", ["işyerim pos"]),
  tokenized("iyzico", "iyzico", "iyzico", "api", "API"),
  define({ sourceSlug: "iyzico-iframe", familyCode: "iyzico", modeCode: "iframe", label: "iyzico", modeLabel: "iFrame", category: "payment_institution", interactionMode: "iframe" }),
  bank("kuveyt-turk", "kuveyt_turk", "Kuveyt Türk", "virtual_pos", "Sanal POS", "direct_pos", ["kuveyt turk"]),
  hosted("lidio", "lidio", "Lidio"),
  tokenized("moka", "moka", "Moka United", "api", "API", ["moka"]),
  hosted("mollie", "mollie", "Mollie", "hosted", "Hosted Ödeme", [], "international"),
  wallet("ozan", "ozan", "Ozan"),
  hosted("paidora", "paidora", "Paidora"),
  wallet("papara", "papara", "Papara", "api", "API"),
  define({ sourceSlug: "papara-checkout", familyCode: "papara", modeCode: "checkout", label: "Papara", modeLabel: "Checkout", category: "wallet", interactionMode: "redirect", aliases: Object.freeze(["papara checkout"]) }),
  wallet("papel", "papel", "Papel"),
  hosted("param", "param", "Param"),
  hosted("paratika", "paratika", "Paratika"),
  hosted("pay-with-iyzico", "iyzico", "iyzico", "pay_with_iyzico", "Pay with iyzico"),
  hosted("paybull", "paybull", "PayBull", "hosted", "Hosted Ödeme", ["pay bull"]),
  wallet("paycell", "paycell", "Paycell"),
  hosted("paynkolay", "paynkolay", "PayNKolay", "hosted", "Hosted Ödeme", ["pay n kolay"]),
  define({ sourceSlug: "paytr", familyCode: "paytr", modeCode: "direct_api", label: "PayTR", modeLabel: "Direct API", category: "payment_institution", interactionMode: "direct_pos", aliases: Object.freeze(["pay tr"]) }),
  define({ sourceSlug: "paytr-iframe", familyCode: "paytr", modeCode: "iframe", label: "PayTR", modeLabel: "iFrame", category: "payment_institution", interactionMode: "iframe", aliases: Object.freeze(["pay tr"]) }),
  hosted("qnbpay", "qnbpay", "QNBpay", "hosted", "Hosted Ödeme", ["qnb pay"]),
  hosted("rubikpara", "rubikpara", "RubikPara", "hosted", "Hosted Ödeme", ["rubik para"]),
  bank("sekerbank", "sekerbank", "Şekerbank", "virtual_pos", "Sanal POS", "direct_pos", ["sekerbank"]),
  wallet("setcard", "setcard", "Setcard", "meal_card", "Yemek Kartı", ["set card"]),
  hosted("shopier", "shopier", "Shopier"),
  hosted("sipay", "sipay", "Sipay"),
  hosted("tami", "tami", "Tami"),
  bank("teb", "teb", "TEB"),
  hosted("united-payment", "united_payment", "United Payment", "hosted", "Hosted Ödeme", ["united payment"]),
  bank("vakif-katilim", "vakif_katilim", "Vakıf Katılım", "virtual_pos", "Sanal POS", "direct_pos", ["vakif katilim"]),
  bank("vakifbank", "vakifbank", "VakıfBank", "virtual_pos", "Sanal POS", "direct_pos", ["vakifbank"]),
  hosted("vallet", "vallet", "Vallet"),
  hosted("vepara", "vepara", "Vepara"),
  hosted("weepay", "weepay", "Weepay"),
  hosted("worldpay", "worldpay", "Worldpay", "hosted", "Hosted Ödeme", [], "international"),
  hosted("wyld", "wyld", "Wyld"),
  bank("yapi-kredi", "yapi_kredi", "Yapı Kredi", "virtual_pos", "Sanal POS", "direct_pos", ["yapi kredi"]),
  bank("ziraat", "ziraat_bankasi", "Ziraat Bankası", "virtual_pos", "Sanal POS", "direct_pos", ["ziraat"]),
  bank("ziraat-katilim", "ziraat_katilim", "Ziraat Katılım", "virtual_pos", "Sanal POS", "direct_pos", ["ziraat katilim"]),
  hosted("ziraatpay", "ziraatpay", "ZiraatPay", "hosted", "Hosted Ödeme", ["ziraat pay"]),
]);
