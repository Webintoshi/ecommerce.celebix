import type { DashboardAnalyticsStatus, DashboardTrafficSource } from "@/lib/admin-data-types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDelta(change: number) {
  if (change === 0) {
    return "Sabit";
  }

  const rounded = Number.isInteger(change)
    ? change.toString()
    : change.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

  return `%${rounded}`;
}

export type DashboardAnalyticsPresentation = {
  state: "configured" | "fallback" | "missing";
  label: string;
  details: string;
  tone: "success" | "warning" | "neutral";
  sourceLabel: string;
  storefrontLabel: string;
};

export type DashboardSalesChannelPresentation = {
  key: "storefront" | "marketplace" | "manual";
  label: string;
  value: string;
  badge: string;
  state: "connected" | "not_configured" | "coming_soon";
};

export type DashboardGrowthRowPresentation = {
  key: "returns" | "productPrice" | "averageOrder" | "averageCartSize";
  label: string;
  value: string;
  badge: string;
  state: "live" | "not_connected" | "coming_soon";
};

function getTrafficSourceLabel(source: DashboardTrafficSource) {
  switch (source) {
    case "umami":
      return "Umami";
    case "plausible":
      return "Plausible fallback";
    case "internal":
      return "İç event fallback";
    default:
      return "Kaynak yok";
  }
}

export function buildDashboardAnalyticsStatus(
  status: DashboardAnalyticsStatus,
): DashboardAnalyticsPresentation {
  const missingParts = [
    !status.umami.baseUrlPresent ? "Base URL" : null,
    !status.umami.apiTokenPresent ? "API token" : null,
    !status.umami.websiteIdPresent ? "Website ID" : null,
  ].filter((item): item is string => Boolean(item));

  if (!status.umami.configured) {
    return {
      state: "missing",
      label: "Analytics bağlantısı yapılandırılmadı",
      details:
        missingParts.length > 0
          ? `Eksik: ${missingParts.join(", ")}. Değerler gizli tutulur.`
          : "Umami bağlantısı eksik görünüyor. Değerler gizli tutulur.",
      tone: "warning",
      sourceLabel: getTrafficSourceLabel(status.source),
      storefrontLabel:
        status.storefrontTracking === "internal"
          ? "Storefront internal tracking aktif"
          : "Storefront tracking doğrulanmadı",
    };
  }

  if (status.source === "umami") {
    return {
      state: "configured",
      label: "Umami bağlı",
      details: "Dashboard trafik verisini Umami kaynağından okuyor. Değerler gizli tutulur.",
      tone: "success",
      sourceLabel: getTrafficSourceLabel(status.source),
      storefrontLabel:
        status.storefrontTracking === "internal"
          ? "Storefront internal tracking aktif"
          : "Storefront tracking doğrulanmadı",
    };
  }

  return {
    state: "fallback",
    label: "Umami yapılandırıldı, trafik fallback ile izleniyor",
    details: "Umami ayarları mevcut; dashboard bu aralıkta fallback trafik kaynağını kullandı.",
    tone: "neutral",
    sourceLabel: getTrafficSourceLabel(status.source),
    storefrontLabel:
      status.storefrontTracking === "internal"
        ? "Storefront internal tracking aktif"
        : "Storefront tracking doğrulanmadı",
  };
}

export function buildDashboardSalesChannels(args: {
  storefrontHost: string;
  storefrontRevenue: number;
  storefrontRevenueChange: number;
}): DashboardSalesChannelPresentation[] {
  return [
    {
      key: "storefront",
      label: args.storefrontHost,
      value: formatCurrency(args.storefrontRevenue),
      badge: formatDelta(args.storefrontRevenueChange),
      state: "connected",
    },
    {
      key: "marketplace",
      label: "Pazaryeri",
      value: "Kanal bağlantısı yok",
      badge: "Bağlı değil",
      state: "not_configured",
    },
    {
      key: "manual",
      label: "Manuel Sipariş",
      value: "Yakında",
      badge: "Planlandı",
      state: "coming_soon",
    },
  ];
}

export function buildDashboardGrowthRows(args: {
  averageOrderValue: number;
  averageCartSize: number;
}): DashboardGrowthRowPresentation[] {
  return [
    {
      key: "returns",
      label: "İade verisi",
      value: "Bağlı değil",
      badge: "Yakında",
      state: "not_connected",
    },
    {
      key: "productPrice",
      label: "Ürün fiyat analizi",
      value: "Yakında",
      badge: "Veri kaynağı yok",
      state: "coming_soon",
    },
    {
      key: "averageOrder",
      label: "Ort. Sipariş Tutarı",
      value: formatCurrency(args.averageOrderValue),
      badge: "Canlı",
      state: "live",
    },
    {
      key: "averageCartSize",
      label: "Ort. Sepet Büyüklüğü",
      value: args.averageCartSize.toLocaleString("tr-TR", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      badge: "Canlı",
      state: "live",
    },
  ];
}

export function getSalesSummaryPanelTitle(hasRealBestSellerData: boolean) {
  return hasRealBestSellerData ? "En Çok Satanlar" : "Son Satılanlar";
}
