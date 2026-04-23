export type ShippingDispatchProvider = "basit-kargo" | "shipink" | "geliver";
export type ShippingDispatchOrderTrigger = "manual" | "confirmed" | "preparing";
export type ShippingDispatchTrigger = "confirmed" | "preparing";

export interface ShippingDispatchIntegrationRecord {
  provider: ShippingDispatchProvider;
  displayName: string;
  enabled: boolean;
  credentials: Record<string, string>;
  configuration: Record<string, string>;
  automation: {
    autoCreateShipment: boolean;
    orderTrigger: ShippingDispatchOrderTrigger;
  };
}

export interface ShippingDispatchSettings {
  version?: number;
  defaultProvider: ShippingDispatchProvider | null;
  integrations: ShippingDispatchIntegrationRecord[];
}

export interface ShippingDispatchOrder {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod?: string | null;
  shippingAddress?: Record<string, unknown> | null;
}

export interface ShippingDispatchOrderItem {
  productName: string;
  variantName?: string | null;
  quantity: number;
  code?: string | null;
}

export interface BasitKargoDispatchResult {
  provider: "basit-kargo";
  remoteOrderId: string | null;
  barcode: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  raw: Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

const basitKargoDistrictCache = new Map<string, string[]>();

const BASIT_KARGO_PROVINCES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bartın",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Düzce",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkâri",
  "Hatay",
  "Iğdır",
  "Isparta",
  "İstanbul",
  "İzmir",
  "Kahramanmaraş",
  "Karabük",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kilis",
  "Kırıkkale",
  "Kırklareli",
  "Kırşehir",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Şırnak",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Şanlıurfa",
  "Uşak",
  "Van",
  "Yalova",
  "Yozgat",
  "Zonguldak",
] as const;

function normalizeTurkishSearchKey(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTurkishLabel(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLocaleLowerCase("tr-TR");
      return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
    })
    .join(" ");
}

function normalizeTurkishProvinceName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = normalizeTurkishSearchKey(trimmed);
  const exactProvince = BASIT_KARGO_PROVINCES.find(
    (province) => normalizeTurkishSearchKey(province) === normalized,
  );

  return exactProvince || normalizeTurkishLabel(trimmed);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function getProvinceDistricts(province: string) {
  if (!province) return [];

  const cachedDistricts = basitKargoDistrictCache.get(province);
  if (cachedDistricts) return cachedDistricts;

  try {
    const response = await fetch(
      `https://api.turkiyeapi.dev/v1/provinces?name=${encodeURIComponent(province)}`,
      {
        cache: "force-cache",
      },
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { data?: unknown };
    const provinceRecord = Array.isArray(payload.data) ? asRecord(payload.data[0]) : {};
    const districts = Array.isArray(provinceRecord.districts)
      ? provinceRecord.districts
          .map((district) => getStringValue(asRecord(district).name))
          .filter(Boolean)
      : [];

    basitKargoDistrictCache.set(province, districts);
    return districts;
  } catch {
    return [];
  }
}

export async function normalizeBasitKargoShippingAddress(
  shippingAddress: Record<string, unknown> | null | undefined,
) {
  const record = asRecord(shippingAddress);
  const cityInput =
    getStringValue(record.city) ||
    getStringValue(record.province);
  const districtInput =
    getStringValue(record.district) ||
    getStringValue(record.town);

  const city = normalizeTurkishProvinceName(cityInput);
  let district = normalizeTurkishLabel(districtInput);

  if (city && district) {
    const officialDistricts = await getProvinceDistricts(city);
    const matchedDistrict = officialDistricts.find(
      (candidate) => normalizeTurkishSearchKey(candidate) === normalizeTurkishSearchKey(district),
    );

    if (matchedDistrict) {
      district = matchedDistrict;
    }
  }

  return {
    ...record,
    city,
    district,
    town: district,
  };
}

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("90") && digits.length > 10) {
    digits = digits.slice(-10);
  }

  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  return digits.slice(-10);
}

function getEffectiveAutomation(
  settingsVersion: number,
  integration: ShippingDispatchIntegrationRecord,
) {
  let autoCreateShipment = integration.automation?.autoCreateShipment ?? false;
  let orderTrigger = integration.automation?.orderTrigger ?? "preparing";

  // Compatibility for the first shared shipping rollout:
  // Basit Kargo had no working outbound dispatcher yet, so existing "false/preparing"
  // settings should behave like an active post-payment automation.
  if (settingsVersion <= 1 && integration.provider === "basit-kargo") {
    autoCreateShipment = true;
    if (orderTrigger === "preparing") {
      orderTrigger = "confirmed";
    }
  }

  return { autoCreateShipment, orderTrigger };
}

export function resolveDispatchIntegration(
  settings: ShippingDispatchSettings,
  trigger: ShippingDispatchTrigger,
) {
  const orderedIntegrations = settings.defaultProvider
    ? [
        ...settings.integrations.filter(
          (integration) => integration.provider === settings.defaultProvider,
        ),
        ...settings.integrations.filter(
          (integration) => integration.provider !== settings.defaultProvider,
        ),
      ]
    : settings.integrations;

  const settingsVersion = Number(settings.version || 1);

  for (const integration of orderedIntegrations) {
    if (!integration.enabled) continue;

    const automation = getEffectiveAutomation(settingsVersion, integration);
    if (!automation.autoCreateShipment) continue;
    if (automation.orderTrigger === "manual") continue;
    if (automation.orderTrigger !== trigger) continue;

    return integration;
  }

  return null;
}

export function buildBasitKargoOrderPayload(
  order: ShippingDispatchOrder,
  items: ShippingDispatchOrderItem[],
) {
  const shippingAddress = order.shippingAddress || {};
  const firstName =
    getStringValue(shippingAddress.firstName) ||
    getStringValue(shippingAddress.first_name);
  const lastName =
    getStringValue(shippingAddress.lastName) ||
    getStringValue(shippingAddress.last_name);
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    getStringValue(shippingAddress.name) ||
    order.orderNumber;

  const cityInput =
    getStringValue(shippingAddress.city) ||
    getStringValue(shippingAddress.province);
  const townInput =
    getStringValue(shippingAddress.district) ||
    getStringValue(shippingAddress.town);
  const city = normalizeTurkishProvinceName(cityInput);
  const town = normalizeTurkishLabel(townInput);
  const postalCode =
    getStringValue(shippingAddress.postalCode) ||
    getStringValue(shippingAddress.postal_code);
  const addressLine =
    [
      getStringValue(shippingAddress.address),
      getStringValue(shippingAddress.addressLine1),
      getStringValue(shippingAddress.addressLine2),
      postalCode,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  const phone = normalizePhone(
    getStringValue(shippingAddress.phone) ||
      getStringValue(shippingAddress.mobilePhone),
  );

  const missingFields: string[] = [];
  if (!city) missingFields.push("şehir");
  if (!town) missingFields.push("ilçe");
  if (!addressLine) missingFields.push("adres");
  if (!phone || phone.length < 10) missingFields.push("telefon");

  if (missingFields.length > 0) {
    throw new Error(
      `Basit Kargo için zorunlu teslimat alanları eksik: ${missingFields.join(", ")}.`,
    );
  }

  const contentItems = items.map((item, index) => ({
    name: [item.productName, item.variantName].filter(Boolean).join(" - "),
    code: item.code || `${order.orderNumber}-${index + 1}`,
    quantity: item.quantity,
  }));

  const payload: Record<string, unknown> = {
    type: "OUTGOING",
    client: {
      name: fullName,
      phone,
      city,
      town,
      address: addressLine,
    },
    content: {
      name: order.orderNumber,
      code: order.orderNumber,
      productPrice: Number(order.total || 0),
      items: contentItems,
      packages: [
        {
          height: 10,
          width: 15,
          depth: 5,
          weight: 1,
        },
      ],
    },
  };

  if (order.paymentMethod === "cash-on-delivery" || order.paymentMethod === "cod") {
    payload.collect = Number(order.total || 0);
    payload.collectOnDeliveryType = "CASH";
  }

  return payload;
}

export function encodeBasitKargoRequestBody(payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  const encodedJson = new TextEncoder().encode(json);
  const result = new Uint8Array(encodedJson.length + 3);

  result.set([0xef, 0xbb, 0xbf], 0);
  result.set(encodedJson, 3);

  return result;
}

export function getBasitKargoValidationFailure(payload: unknown) {
  const data = asRecord(payload);
  const failed = data.validationFailed === true || getStringValue(data.validationFailed) === "true";

  if (!failed) return null;

  return (
    getStringValue(data.validationFailedMessage) ||
    getStringValue(data.message) ||
    "Basit Kargo doğrulaması başarısız oldu."
  );
}

export function parseBasitKargoDispatchResult(
  payload: unknown,
  fallbackCarrier: string,
): BasitKargoDispatchResult {
  const data = asRecord(payload);
  const handler = asRecord(data.handler);
  const barcode =
    getStringValue(data.barcode) ||
    getStringValue(data.orderBarcode) ||
    getStringValue(data.cargoBarcode) ||
    null;
  const trackingNumber =
    getStringValue(data.handlerShipmentCode) ||
    getStringValue(data.trackingNumber) ||
    barcode;
  const carrier =
    getStringValue(handler.name) ||
    getStringValue(data.handlerName) ||
    fallbackCarrier;
  const remoteOrderId =
    getStringValue(data.id) ||
    getStringValue(data.orderId) ||
    null;

  return {
    provider: "basit-kargo",
    remoteOrderId,
    barcode,
    trackingNumber,
    carrier,
    raw: data,
  };
}
