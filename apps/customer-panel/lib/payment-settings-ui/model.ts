import type {
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
  PaymentProviderCategory,
  PaymentProviderEnvironment,
  PaymentProviderInteractionMode,
  PaymentProviderReadiness,
} from "@celebix/saas-contracts";

export type PaymentSettingsTone = "success" | "warning" | "danger" | "neutral";
export type PaymentSettingsFilters = Readonly<{
  category: PaymentProviderCategory | "all";
  interactionMode: Exclude<PaymentProviderInteractionMode, "offline"> | "all";
  readiness: PaymentProviderReadiness | "all";
  environment: PaymentProviderEnvironment | "all";
}>;

const CATEGORY_LABELS = Object.freeze({
  bank_pos: "Banka POS",
  payment_institution: "Ödeme kuruluşu",
  wallet: "Dijital cüzdan",
  international: "Uluslararası",
} as const);
const INTERACTION_LABELS = Object.freeze({
  redirect: "Yönlendirme",
  iframe: "iFrame",
  tokenized: "Tokenize",
  direct_pos: "Doğrudan POS",
  wallet: "Cüzdan",
} as const);
const READINESS_LABELS = Object.freeze({
  production_ready: "Canlı kullanıma hazır",
  sandbox_ready: "Test ortamına hazır",
  verification: "Doğrulanıyor",
  planned: "Hazırlanıyor",
  maintenance: "Bakımda",
} as const);
const READINESS_TONES: Readonly<Record<PaymentProviderReadiness, PaymentSettingsTone>> = Object.freeze({
  production_ready: "success",
  sandbox_ready: "success",
  verification: "warning",
  planned: "neutral",
  maintenance: "warning",
});
const METHOD_STATUS = Object.freeze({
  active: Object.freeze({ label: "Etkin", tone: "success" as const }),
  disabled: Object.freeze({ label: "Devre dışı", tone: "neutral" as const }),
  emergency_disabled: Object.freeze({ label: "Acil durumda kapalı", tone: "danger" as const }),
});
const PROFILE_STATUS = Object.freeze({
  pending_validation: Object.freeze({ label: "Doğrulama bekliyor", tone: "warning" as const }),
  active: Object.freeze({ label: "Bağlı", tone: "success" as const }),
  disabled: Object.freeze({ label: "Devre dışı", tone: "neutral" as const }),
  rotation_required: Object.freeze({ label: "Anahtar yenileme gerekli", tone: "warning" as const }),
  revoked: Object.freeze({ label: "Bağlantı iptal edildi", tone: "danger" as const }),
});
const BUILT_IN_PROFILE = Object.freeze({ label: "Yerleşik yöntem", tone: "neutral" as const });

export type PaymentProviderCatalogCard = Readonly<{
  providerCode: string;
  familyCode: string;
  modeCode: string;
  label: string;
  modeLabel: string;
  logoPath: string;
  aliases: readonly string[];
  category: PaymentProviderCategory;
  categoryLabel: string;
  interactionMode: Exclude<PaymentProviderInteractionMode, "offline">;
  interactionLabel: string;
  readiness: PaymentProviderReadiness;
  readinessLabel: string;
  readinessTone: PaymentSettingsTone;
  environments: readonly PaymentProviderEnvironment[];
  environmentLabel: string;
  connectable: boolean;
  actionLabel: "Bağla" | "Hazırlanıyor";
  executableDescriptor: MerchantProviderDescriptor | null;
}>;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replaceAll("ı", "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cloneDescriptor(value: MerchantProviderDescriptor): MerchantProviderDescriptor {
  return Object.freeze({
    providerCode: value.providerCode,
    capability: value.capability,
    label: value.label,
    publicFields: Object.freeze(value.publicFields.map((field) => Object.freeze({
      key: field.key,
      label: field.label,
    }))),
    credentialFields: Object.freeze(value.credentialFields.map((field) => Object.freeze({
      key: field.key,
      label: field.label,
      secret: true as const,
    }))),
  });
}

function environmentLabel(environments: readonly PaymentProviderEnvironment[]): string {
  if (environments.includes("test") && environments.includes("live")) return "Test ve canlı";
  return environments[0] === "live" ? "Canlı" : "Test";
}

function catalogCard(
  entry: PaymentProviderCatalogEntry,
  descriptors: readonly MerchantProviderDescriptor[],
): PaymentProviderCatalogCard {
  const ready = entry.readiness === "production_ready" || entry.readiness === "sandbox_ready";
  const descriptor = ready
    ? descriptors.find((candidate) =>
      candidate.providerCode === entry.providerCode && candidate.capability === "payment_processing")
    : undefined;
  const connectable = descriptor !== undefined;
  return Object.freeze({
    providerCode: entry.providerCode,
    familyCode: entry.familyCode,
    modeCode: entry.modeCode,
    label: entry.label,
    modeLabel: entry.modeLabel,
    logoPath: entry.logoPath,
    aliases: Object.freeze([...entry.aliases]),
    category: entry.category,
    categoryLabel: CATEGORY_LABELS[entry.category],
    interactionMode: entry.interactionMode,
    interactionLabel: INTERACTION_LABELS[entry.interactionMode],
    readiness: entry.readiness,
    readinessLabel: READINESS_LABELS[entry.readiness],
    readinessTone: READINESS_TONES[entry.readiness],
    environments: Object.freeze([...entry.environments]),
    environmentLabel: environmentLabel(entry.environments),
    connectable,
    actionLabel: connectable ? "Bağla" : "Hazırlanıyor",
    executableDescriptor: descriptor ? cloneDescriptor(descriptor) : null,
  });
}

export function buildPaymentSettingsViewModel(
  catalog: readonly PaymentProviderCatalogEntry[],
  definitions: readonly MerchantProviderDescriptor[],
  profiles: readonly MerchantProviderProfile[],
  methods: readonly MerchantPaymentMethod[],
  query: string,
  filters: PaymentSettingsFilters,
) {
  const normalizedQuery = normalize(query);
  const cards = Object.freeze(catalog
    .map((entry) => catalogCard(entry, definitions))
    .filter((card) => {
      const searchable = normalize([card.label, card.modeLabel, ...card.aliases].join(" "));
      return (normalizedQuery === "" || searchable.includes(normalizedQuery))
        && (filters.category === "all" || card.category === filters.category)
        && (filters.interactionMode === "all" || card.interactionMode === filters.interactionMode)
        && (filters.readiness === "all" || card.readiness === filters.readiness)
        && (filters.environment === "all" || card.environments.includes(filters.environment));
    }));

  const familyMap = new Map<string, { label: string; logoPath: string; modes: PaymentProviderCatalogCard[] }>();
  for (const card of cards) {
    const existing = familyMap.get(card.familyCode);
    if (existing) existing.modes.push(card);
    else familyMap.set(card.familyCode, { label: card.label, logoPath: card.logoPath, modes: [card] });
  }
  const families = Object.freeze([...familyMap.entries()].map(([familyCode, family]) => Object.freeze({
    familyCode,
    label: family.label,
    logoPath: family.logoPath,
    modes: Object.freeze(family.modes),
  })));

  const profileById = new Map(profiles.map((item) => [item.id, item] as const));
  const catalogByCode = new Map(catalog.map((entry) => [entry.providerCode, entry] as const));
  const methodRows = Object.freeze([...methods]
    .sort((left, right) => left.position - right.position || compareAscii(left.id, right.id))
    .map((item) => {
      const provider = item.providerCode === null ? undefined : catalogByCode.get(item.providerCode);
      const selectedProfile = item.profileId === null ? undefined : profileById.get(item.profileId);
      const state = METHOD_STATUS[item.state];
      const profileStatus = selectedProfile ? PROFILE_STATUS[selectedProfile.status] : BUILT_IN_PROFILE;
      const configuredEnvironment = item.config.environment;
      const environment = configuredEnvironment === "test" || configuredEnvironment === "live"
        ? configuredEnvironment
        : null;
      return Object.freeze({
        id: item.id,
        kind: item.kind,
        providerCode: item.providerCode,
        profileId: item.profileId,
        label: item.label,
        logoPath: provider?.logoPath ?? null,
        providerLabel: provider?.label ?? (item.kind === "cash_on_delivery" ? "Kapıda ödeme" : "Banka havalesi"),
        modeLabel: provider?.modeLabel ?? "Çevrimdışı",
        environment,
        environmentLabel: environment === "live" ? "Canlı" : environment === "test" ? "Test" : "Yerleşik",
        state: item.state,
        stateLabel: state.label,
        stateTone: state.tone,
        emergencyReason: item.emergencyReason,
        profileStatus: selectedProfile?.status ?? null,
        profileStatusLabel: profileStatus.label,
        profileStatusTone: profileStatus.tone,
        position: item.position,
        version: item.version,
      });
    }));

  const checkoutPreview = Object.freeze(methodRows
    .filter((item) => item.state === "active")
    .map((item) => Object.freeze({
      id: item.id,
      label: item.label,
      kind: item.kind,
      logoPath: item.logoPath,
      position: item.position,
    })));

  const counts = Object.freeze({
    methods: methods.length,
    activeMethods: methods.filter((item) => item.state === "active").length,
    emergencyMethods: methods.filter((item) => item.state === "emergency_disabled").length,
    profiles: profiles.length,
    pendingProfiles: profiles.filter((item) => item.status === "pending_validation").length,
  });

  return Object.freeze({
    catalog: Object.freeze({
      cards,
      families,
      totalCount: catalog.length,
      visibleCount: cards.length,
      emptyLabel: catalog.length === 0 ? "Sağlayıcı kataloğu henüz hazır değil" : cards.length === 0 ? "Eşleşen sağlayıcı bulunamadı" : null,
    }),
    methods: methodRows,
    checkoutPreview,
    counts,
    availabilityLabel: methods.length === 0 ? "Henüz yöntem yok" : `${counts.activeMethods} etkin yöntem`,
  });
}
