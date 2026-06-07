export type OptionalAdminModuleKey =
  | "quick_order_links"
  | "coupons"
  | "lucky_wheel"
  | "marketplace"
  | "accounting";

export type OptionalAdminModuleState = {
  code: "feature_disabled";
  featureDisabled: true;
  featureKey: OptionalAdminModuleKey;
  title: string;
  message: string;
  detail: string;
};

type OptionalAdminModuleDescriptor = OptionalAdminModuleState & {
  tableNames: string[];
  extraIncludes?: string[];
};

const OPTIONAL_ADMIN_MODULES: Record<
  OptionalAdminModuleKey,
  OptionalAdminModuleDescriptor
> = {
  quick_order_links: {
    code: "feature_disabled",
    featureDisabled: true,
    featureKey: "quick_order_links",
    title: "Hızlı sipariş linkleri aktif değil",
    message: "Bu özellik bu mağazada henüz aktif değil.",
    detail:
      "Kurulum tamamlandığında müşterilere özel ödeme linkleri buradan güvenle oluşturulabilir.",
    tableNames: ["quick_order_links", "quick_order_link_items"],
  },
  coupons: {
    code: "feature_disabled",
    featureDisabled: true,
    featureKey: "coupons",
    title: "İndirim modülü aktif değil",
    message: "Bu özellik bu mağazada henüz aktif değil.",
    detail:
      "Kurulum tamamlandığında kupon ve kampanya yönetimi yeniden kullanılabilir olacak.",
    tableNames: ["coupons"],
  },
  lucky_wheel: {
    code: "feature_disabled",
    featureDisabled: true,
    featureKey: "lucky_wheel",
    title: "Şans çarkı aktif değil",
    message: "Bu özellik bu mağazada henüz aktif değil.",
    detail:
      "Kampanya kurulumu tamamlandığında şans çarkı ayarları ve ödülleri buradan yönetilebilir.",
    tableNames: ["lucky_wheel_configs", "lucky_wheel_prizes", "lucky_wheel_spins"],
  },
  marketplace: {
    code: "feature_disabled",
    featureDisabled: true,
    featureKey: "marketplace",
    title: "Pazaryeri entegrasyonları aktif değil",
    message: "Bu özellik bu mağazada henüz aktif değil.",
    detail:
      "Kurulum tamamlandığında bağlantı, listing ve senkron ekranları yeniden kullanılabilir olacak.",
    tableNames: [
      "marketplace_provider_connections",
      "marketplace_listings",
      "marketplace_orders",
      "marketplace_sync_jobs",
      "marketplace_sync_logs",
      "marketplace_sync_queue",
      "marketplace_webhook_events",
    ],
    extraIncludes: [
      "Marketplace runtime tablolari bulunamadi. Migration dosyasini calistirin.",
    ],
  },
  accounting: {
    code: "feature_disabled",
    featureDisabled: true,
    featureKey: "accounting",
    title: "Muhasebe entegrasyonları aktif değil",
    message: "Bu özellik bu mağazada henüz aktif değil.",
    detail:
      "Kurulum tamamlandığında fatura, tahsilat ve entegrasyon ekranları yeniden kullanılabilir olacak.",
    tableNames: [
      "accounting_provider_connections",
      "accounting_invoice_queue",
      "accounting_invoices",
      "accounting_payments",
      "accounting_sync_jobs",
      "accounting_sync_logs",
    ],
    extraIncludes: [
      "Muhasebe tablolari bulunamadi. Once sql/accounting_runtime.sql dosyasini calistirin.",
    ],
  },
};

export class OptionalAdminModuleUnavailableError extends Error {
  readonly featureKey: OptionalAdminModuleKey;
  readonly state: OptionalAdminModuleState;

  constructor(featureKey: OptionalAdminModuleKey) {
    const state = getOptionalAdminModuleState(featureKey);
    super(state.message);
    this.name = "OptionalAdminModuleUnavailableError";
    this.featureKey = featureKey;
    this.state = state;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return "";
  }

  return String(error.message ?? "");
}

function isCompatTableUnsupported(message: string, tableName: string) {
  return (
    message.includes(
      `light_postgres compatibility table destegi bulunamadi: ${tableName}`,
    ) ||
    message.includes(`Insert desteklenmiyor: ${tableName}`) ||
    message.includes(`Update desteklenmiyor: ${tableName}`) ||
    message.includes(`Delete desteklenmiyor: ${tableName}`)
  );
}

function isMissingTableMessage(message: string, tableName: string) {
  const escapedTableName = escapeRegExp(tableName);
  return (
    new RegExp(
      `Could not find the table 'public\\.${escapedTableName}' in the schema cache`,
      "i",
    ).test(message) ||
    new RegExp(
      `relation ["']public\\.${escapedTableName}["'] does not exist`,
      "i",
    ).test(message) ||
    new RegExp(`relation ["']${escapedTableName}["'] does not exist`, "i").test(
      message,
    ) ||
    isCompatTableUnsupported(message, tableName)
  );
}

export function getOptionalAdminModuleState(
  featureKey: OptionalAdminModuleKey,
): OptionalAdminModuleState {
  const moduleState = OPTIONAL_ADMIN_MODULES[featureKey];
  return {
    code: moduleState.code,
    featureDisabled: moduleState.featureDisabled,
    featureKey: moduleState.featureKey,
    title: moduleState.title,
    message: moduleState.message,
    detail: moduleState.detail,
  };
}

export function isOptionalAdminModuleUnavailable(
  featureKey: OptionalAdminModuleKey,
  error: unknown,
) {
  if (error instanceof OptionalAdminModuleUnavailableError) {
    return error.featureKey === featureKey;
  }

  const message = getErrorMessage(error);
  if (!message) {
    return false;
  }

  const descriptor = OPTIONAL_ADMIN_MODULES[featureKey];
  if (descriptor.extraIncludes?.some((value) => message.includes(value))) {
    return true;
  }

  return descriptor.tableNames.some((tableName) =>
    isMissingTableMessage(message, tableName),
  );
}

export function createOptionalAdminModuleUnavailableError(
  featureKey: OptionalAdminModuleKey,
) {
  return new OptionalAdminModuleUnavailableError(featureKey);
}

export function getOptionalAdminModuleFailurePayload(
  featureKey: OptionalAdminModuleKey,
) {
  const state = getOptionalAdminModuleState(featureKey);
  return {
    success: false,
    error: state.message,
    ...state,
  };
}
