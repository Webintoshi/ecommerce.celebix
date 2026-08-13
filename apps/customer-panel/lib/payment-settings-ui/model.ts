import type {
  BuiltInPaymentMethodKind,
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
  PaymentProviderCategory,
  PaymentProviderEnvironment,
  PaymentProviderInteractionMode,
  PaymentProviderReadiness,
} from "@celebix/saas-contracts";

import {
  buildProviderCheckoutPreferenceSummary,
  buildProviderCheckoutPreferenceView,
} from "./provider-preferences.ts";

export type PaymentSettingsTone = "success" | "warning" | "danger" | "neutral";
export type BuiltInPaymentMethodCatalogCard = Readonly<{
  kind: BuiltInPaymentMethodKind;
  label: string;
  description: string;
  configured: boolean | null;
  active: boolean | null;
  available: boolean;
  actionLabel: "Ekle" | "Yapılandırıldı" | "Kullanılamıyor";
}>;
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
const BUILT_IN_METHOD_CARDS = Object.freeze([
  Object.freeze({
    kind: "cash_on_delivery" as const,
    label: "Kapıda ödeme",
    description: "Müşteriler siparişlerini teslim alırken ödeme yapar.",
  }),
  Object.freeze({
    kind: "bank_transfer" as const,
    label: "Banka havalesi",
    description: "Müşteriler banka hesabınıza havale veya EFT ile ödeme yapar.",
  }),
]);

type PaymentProviderConnectionBase = Readonly<{
  providerCode: string;
  label: string;
  environment: PaymentProviderEnvironment;
  environmentLabel: "Test ortamı" | "Canlı ortam";
  callbackUrl: string;
  statusLabel: string;
  statusTone: PaymentSettingsTone;
  maskedAccountReference: string | null;
  credentialVersionLabel: string | null;
  lastValidatedAt: string | null;
  canRotate: boolean;
}>;

export type PaytrPaymentProviderConnectionView = PaymentProviderConnectionBase & Readonly<{
  kind: "paytr";
  submitLabel: "Ayarları Kaydet";
  merchantIdInitialValue: string;
  anotherActiveProviderLabel: string | null;
}>;

export type GenericPaymentProviderConnectionView = PaymentProviderConnectionBase & Readonly<{
  kind: "generic";
  submitLabel: "Bağlantıyı kaydet" | "Bilgileri yenile";
  publicFields: readonly Readonly<{ key: string; label: string; initialValue: string }>[];
  credentialFields: readonly Readonly<{
    key: string;
    label: string;
    secret: true;
    initialValue: "";
  }>[];
}>;

export type PaymentProviderConnectionView =
  | PaytrPaymentProviderConnectionView
  | GenericPaymentProviderConnectionView;

function connectionInvalid(): never {
  throw new TypeError("payment_provider_connection_invalid");
}

function canonicalStorefrontHostname(value: string): string {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 ||
    value !== value.toLowerCase() || !value.includes(".") ||
    !/[a-z]/.test(value.slice(value.lastIndexOf(".") + 1)) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:[.][a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)
  ) connectionInvalid();
  return value;
}

export function buildPaymentProviderConnectionViewModel(input: Readonly<{
  descriptor: MerchantProviderDescriptor;
  environment: PaymentProviderEnvironment;
  profile?: MerchantProviderProfile;
  storefrontHostname: string;
  methods?: readonly MerchantPaymentMethod[];
  providerUnavailable?: boolean;
}>): PaymentProviderConnectionView {
  const descriptor = cloneDescriptor(input.descriptor);
  if (descriptor.capability !== "payment_processing") connectionInvalid();
  const environment = input.environment;
  if (environment !== "test" && environment !== "live") connectionInvalid();
  const storefrontHostname = canonicalStorefrontHostname(input.storefrontHostname);
  const selectedProfile = input.profile;
  if (selectedProfile && (
    selectedProfile.providerCode !== descriptor.providerCode ||
    selectedProfile.capability !== descriptor.capability ||
    selectedProfile.publicConfig.environment !== environment
  )) connectionInvalid();
  const genericProfileStatus = selectedProfile?.status === "active"
    && descriptor.adapterVersion !== undefined
    && descriptor.environments !== undefined
    ? descriptor.executionAuthority === null
      ? Object.freeze({ label: "Doğrulandı — sandbox kanıtı bekleniyor", tone: "warning" as const })
      : Object.freeze({ label: "Aktivasyona hazır", tone: "success" as const })
    : selectedProfile ? PROFILE_STATUS[selectedProfile.status] : Object.freeze({
    label: "Henüz bağlanmadı",
    tone: "neutral" as const,
  });
  const canRotate = selectedProfile !== undefined && [
    "pending_validation", "active", "disabled", "rotation_required",
  ].includes(selectedProfile.status);
  const common = {
    providerCode: descriptor.providerCode,
    label: descriptor.label,
    environment,
    environmentLabel: environment === "test" ? "Test ortamı" : "Canlı ortam",
    callbackUrl: `https://${storefrontHostname}/api/payments/${descriptor.providerCode}/callback/{işleme-özel-bağlantı}`,
    maskedAccountReference: selectedProfile?.maskedAccountReference ?? null,
    credentialVersionLabel: selectedProfile ? `Sürüm ${selectedProfile.credentialVersion}` : null,
    lastValidatedAt: selectedProfile?.lastValidatedAt ?? null,
    canRotate,
  } as const;
  if (descriptor.providerCode === "paytr_iframe") {
    const methods = input.methods ?? [];
    const activePaytrMethod = selectedProfile !== undefined && methods.some((method) => {
      if (
        method.kind !== "provider"
        || method.providerCode !== "paytr_iframe"
        || method.profileId !== selectedProfile.id
        || method.state !== "active"
      ) return false;
      try {
        return buildProviderCheckoutPreferenceView(method).environment === environment;
      } catch {
        return false;
      }
    });
    const status = input.providerUnavailable
      ? Object.freeze({ label: "PayTR'a şu anda ulaşılamıyor", tone: "warning" as const })
      : selectedProfile?.status === "pending_validation"
        ? Object.freeze({ label: "Kontrol ediliyor", tone: "warning" as const })
        : selectedProfile?.status === "rotation_required"
          ? Object.freeze({ label: "PayTR bilgileri doğrulanamadı", tone: "danger" as const })
          : selectedProfile?.status === "disabled"
            ? Object.freeze({ label: "Devre dışı", tone: "neutral" as const })
            : selectedProfile?.status === "revoked"
              ? Object.freeze({ label: "Bilgiler yenilenmeli", tone: "warning" as const })
              : selectedProfile?.status === "active" && (input.methods === undefined || activePaytrMethod)
                ? Object.freeze({
                    label: environment === "test" ? "Aktif - Test modu" : "Aktif - Canlı",
                    tone: "success" as const,
                  })
                : selectedProfile?.status === "active"
                  ? Object.freeze({ label: "PayTR'a şu anda ulaşılamıyor", tone: "warning" as const })
                  : Object.freeze({ label: "Kurulmadı", tone: "neutral" as const });
    const anotherActiveProvider = methods.find((method) =>
      method.kind === "provider"
      && method.providerCode !== "paytr_iframe"
      && method.state === "active");
    return Object.freeze({
      ...common,
      kind: "paytr" as const,
      callbackUrl: `https://${storefrontHostname}/api/payments/paytr/callback`,
      statusLabel: status.label,
      statusTone: status.tone,
      submitLabel: "Ayarları Kaydet" as const,
      merchantIdInitialValue: typeof selectedProfile?.publicConfig.merchantId === "string"
        ? selectedProfile.publicConfig.merchantId
        : "",
      anotherActiveProviderLabel: anotherActiveProvider?.label ?? null,
    });
  }
  return Object.freeze({
    ...common,
    kind: "generic" as const,
    statusLabel: genericProfileStatus.label,
    statusTone: genericProfileStatus.tone,
    callbackUrl: `https://${storefrontHostname}/api/payments/${descriptor.providerCode}/callback/{işleme-özel-bağlantı}`,
    submitLabel: canRotate ? "Bilgileri yenile" : "Bağlantıyı kaydet",
    publicFields: Object.freeze(descriptor.publicFields.map((field) => Object.freeze({
      key: field.key,
      label: field.label,
      initialValue: typeof selectedProfile?.publicConfig[field.key] === "string"
        ? selectedProfile.publicConfig[field.key] as string
        : "",
    }))),
    credentialFields: Object.freeze(descriptor.credentialFields.map((field) => Object.freeze({
      key: field.key,
      label: field.label,
      secret: true as const,
      initialValue: "" as const,
    }))),
  });
}

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
  configurable: boolean;
  executable: boolean;
  connectable: boolean;
  actionLabel:
    | "Kur"
    | "Kontrol ediliyor"
    | "Yapılandırıldı"
    | "Bilgileri düzelt"
    | "Yeniden etkinleştir"
    | "Bilgileri gir"
    | "Bağla"
    | "Etkinleştir"
    | "Hazırlanıyor";
  lifecycleLabel:
    | "Kurulmadı"
    | "Kontrol ediliyor"
    | "Aktif - Test modu"
    | "Aktif - Canlı"
    | "PayTR bilgileri doğrulanamadı"
    | "PayTR'a şu anda ulaşılamıyor"
    | "Henüz bağlanmadı"
    | "Hazırlanıyor"
    | "Bakımda"
    | "Doğrulama bekliyor"
    | "Doğrulandı — sandbox kanıtı bekleniyor"
    | "Bağlı — aktivasyon bekliyor"
    | "Anahtar yenileme gerekli"
    | "Devre dışı"
    | "Aktif";
  connectionEnvironment: PaymentProviderEnvironment | null;
  configurableDescriptor: MerchantProviderDescriptor | null;
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

const CONNECTION_PROFILE_STATUS_RANK = Object.freeze({
  active: 0,
  pending_validation: 1,
  rotation_required: 2,
  disabled: 3,
  revoked: 4,
} as const);

export function selectPaymentProviderConnectionProfile(
  profiles: readonly MerchantProviderProfile[],
  providerCode: string,
  environments: readonly PaymentProviderEnvironment[],
): MerchantProviderProfile | null {
  const environmentRank = new Map(environments.map((environment, index) => [environment, index]));
  const selected = profiles.filter((profile) => {
    const environment = profile.publicConfig.environment;
    return profile.providerCode === providerCode
      && profile.capability === "payment_processing"
      && profile.status !== "revoked"
      && (environment === "test" || environment === "live")
      && environmentRank.has(environment);
  }).sort((left, right) => {
    const status = CONNECTION_PROFILE_STATUS_RANK[left.status]
      - CONNECTION_PROFILE_STATUS_RANK[right.status];
    if (status !== 0) return status;
    const leftEnvironment = left.publicConfig.environment as PaymentProviderEnvironment;
    const rightEnvironment = right.publicConfig.environment as PaymentProviderEnvironment;
    const environment = environmentRank.get(leftEnvironment)! - environmentRank.get(rightEnvironment)!;
    if (environment !== 0) return environment;
    const updatedAt = compareAscii(right.updatedAt, left.updatedAt);
    return updatedAt !== 0 ? updatedAt : compareAscii(right.id, left.id);
  });
  return selected[0] ?? null;
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
    ...(value.capability === "payment_processing" && value.adapterVersion !== undefined && value.environments !== undefined ? {
      adapterVersion: value.adapterVersion,
      environments: Object.freeze([...value.environments]),
      executionAuthority: value.executionAuthority === null || value.executionAuthority === undefined
        ? null
        : Object.freeze({ ...value.executionAuthority }),
    } : {}),
  });
}

function environmentLabel(environments: readonly PaymentProviderEnvironment[]): string {
  if (environments.includes("test") && environments.includes("live")) return "Test ve canlı";
  return environments[0] === "live" ? "Canlı" : "Test";
}

function exactExecutionDescriptor(
  entry: PaymentProviderCatalogEntry,
  descriptor: MerchantProviderDescriptor,
): boolean {
  const authority = entry.executionAuthority;
  const descriptorAuthority = descriptor.executionAuthority;
  const expectedEnvironment = entry.readiness === "sandbox_ready" ? "test"
    : entry.readiness === "production_ready" ? "live" : null;
  return authority !== null && expectedEnvironment !== null
    && authority.environment === expectedEnvironment
    && entry.environments.includes(authority.environment)
    && descriptor.adapterVersion === authority.adapterVersion
    && descriptor.environments?.includes(authority.environment) === true
    && descriptorAuthority !== null && descriptorAuthority !== undefined
    && descriptorAuthority.environment === authority.environment
    && descriptorAuthority.adapterVersion === authority.adapterVersion
    && descriptorAuthority.evidenceDigest === authority.evidenceDigest;
}

function exactVerificationDescriptor(
  entry: PaymentProviderCatalogEntry,
  descriptor: MerchantProviderDescriptor,
): boolean {
  return entry.readiness === "verification"
    && entry.executionAuthority === null
    && descriptor.executionAuthority === null
    && descriptor.adapterVersion !== undefined
    && descriptor.environments !== undefined
    && descriptor.environments.length === entry.environments.length
    && descriptor.environments.every((environment, index) => environment === entry.environments[index]);
}

function catalogCard(
  entry: PaymentProviderCatalogEntry,
  descriptors: readonly MerchantProviderDescriptor[],
  profiles: readonly MerchantProviderProfile[],
  methods: readonly MerchantPaymentMethod[],
): PaymentProviderCatalogCard {
  const ready = entry.readiness === "production_ready" || entry.readiness === "sandbox_ready";
  const executableDescriptor = ready
    ? descriptors.find((candidate) =>
      candidate.providerCode === entry.providerCode && candidate.capability === "payment_processing"
      && exactExecutionDescriptor(entry, candidate))
    : undefined;
  const verificationDescriptor = entry.readiness === "verification"
    ? descriptors.find((candidate) =>
      candidate.providerCode === entry.providerCode && candidate.capability === "payment_processing"
      && exactVerificationDescriptor(entry, candidate))
    : undefined;
  const configurableDescriptor = executableDescriptor ?? verificationDescriptor;
  const configurable = configurableDescriptor !== undefined;
  const executable = executableDescriptor !== undefined;
  const connectionProfile = configurableDescriptor?.environments === undefined
    ? null
    : selectPaymentProviderConnectionProfile(
        profiles,
        entry.providerCode,
        configurableDescriptor.environments,
      );
  const activeProfile = connectionProfile?.status === "active";
  const paytr = entry.providerCode === "paytr_iframe";
  const activeMethod = (paytr || executable) && methods.some((candidate) => {
    if (
      candidate.kind !== "provider"
      || candidate.providerCode !== entry.providerCode
      || candidate.profileId !== connectionProfile?.id
      || candidate.state !== "active"
    ) return false;
    try {
      return buildProviderCheckoutPreferenceView(candidate).environment
        === connectionProfile?.publicConfig.environment;
    } catch {
      return false;
    }
  });
  const profileEnvironment = connectionProfile?.publicConfig.environment;
  const connectionEnvironment = profileEnvironment === "test" || profileEnvironment === "live"
    ? profileEnvironment
    : entry.readiness === "production_ready"
      ? "live"
      : configurableDescriptor?.environments?.[0] ?? null;
  const paytrLifecycleLabel = connectionProfile?.status === "pending_validation"
    ? "Kontrol ediliyor" as const
    : connectionProfile?.status === "rotation_required"
      ? "PayTR bilgileri doğrulanamadı" as const
      : connectionProfile?.status === "disabled"
        ? "Devre dışı" as const
        : connectionProfile?.status === "active" && activeMethod
          ? connectionEnvironment === "live" ? "Aktif - Canlı" as const : "Aktif - Test modu" as const
          : connectionProfile?.status === "active"
            ? "PayTR'a şu anda ulaşılamıyor" as const
            : "Kurulmadı" as const;
  const paytrTone: PaymentSettingsTone = paytrLifecycleLabel === "Aktif - Test modu"
    || paytrLifecycleLabel === "Aktif - Canlı"
    ? "success"
    : paytrLifecycleLabel === "PayTR bilgileri doğrulanamadı"
      ? "danger"
      : paytrLifecycleLabel === "Kontrol ediliyor"
        || paytrLifecycleLabel === "PayTR'a şu anda ulaşılamıyor"
        ? "warning"
        : "neutral";
  const lifecycleLabel = paytr && configurable ? paytrLifecycleLabel : !configurable
    ? entry.readiness === "maintenance" ? "Bakımda" as const : "Hazırlanıyor" as const
    : activeMethod ? "Aktif" as const
    : executable && activeProfile ? "Bağlı — aktivasyon bekliyor" as const
    : activeProfile ? "Doğrulandı — sandbox kanıtı bekleniyor" as const
    : connectionProfile?.status === "pending_validation" ? "Doğrulama bekliyor" as const
    : connectionProfile?.status === "rotation_required" ? "Anahtar yenileme gerekli" as const
    : connectionProfile?.status === "disabled" ? "Devre dışı" as const
    : "Henüz bağlanmadı" as const;
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
    readinessLabel: paytr && configurable ? paytrLifecycleLabel : READINESS_LABELS[entry.readiness],
    readinessTone: paytr && configurable ? paytrTone : READINESS_TONES[entry.readiness],
    environments: Object.freeze([...entry.environments]),
    environmentLabel: environmentLabel(entry.environments),
    configurable,
    executable,
    connectable: configurable && !(paytr && connectionProfile?.status === "pending_validation"),
    actionLabel: paytr && configurable
      ? connectionProfile?.status === "pending_validation" ? "Kontrol ediliyor"
        : connectionProfile?.status === "active" ? "Yapılandırıldı"
        : connectionProfile?.status === "rotation_required" ? "Bilgileri düzelt"
        : connectionProfile?.status === "disabled" ? "Yeniden etkinleştir"
        : "Kur"
      : executable && activeProfile && !activeMethod
      ? "Etkinleştir"
      : executable ? "Bağla" : configurable ? "Bilgileri gir" : "Hazırlanıyor",
    lifecycleLabel,
    connectionEnvironment: configurable ? connectionEnvironment : null,
    configurableDescriptor: configurableDescriptor ? cloneDescriptor(configurableDescriptor) : null,
    executableDescriptor: executableDescriptor ? cloneDescriptor(executableDescriptor) : null,
  });
}

export function buildPaymentSettingsViewModel(
  catalog: readonly PaymentProviderCatalogEntry[],
  definitions: readonly MerchantProviderDescriptor[],
  profiles: readonly MerchantProviderProfile[],
  methods: readonly MerchantPaymentMethod[],
  query: string,
  filters: PaymentSettingsFilters,
  methodsKnown = true,
) {
  const builtInMethods = new Map(BUILT_IN_METHOD_CARDS.map(({ kind }) => [
    kind,
    methods.filter((method) => method.kind === kind),
  ] as const));
  const builtInCards = Object.freeze(BUILT_IN_METHOD_CARDS.map((definition) => {
    const matches = builtInMethods.get(definition.kind)!;
    const method = matches.length === 1 ? matches[0] : undefined;
    const available = methodsKnown && matches.length <= 1;
    return Object.freeze({
      ...definition,
      configured: available ? method !== undefined : null,
      active: available ? method?.state === "active" : null,
      available,
      actionLabel: !available
        ? "Kullanılamıyor" as const
        : method === undefined ? "Ekle" as const : "Yapılandırıldı" as const,
    });
  }));
  const normalizedQuery = normalize(query);
  const cards = Object.freeze(catalog
    .map((entry) => catalogCard(entry, definitions, profiles, methods))
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
      let checkoutPreferenceLabel: string | null = null;
      if (item.kind === "provider") {
        try {
          checkoutPreferenceLabel = buildProviderCheckoutPreferenceSummary(item).label;
        } catch {
          checkoutPreferenceLabel = null;
        }
      }
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
        checkoutPreferenceLabel,
        state: item.state,
        stateLabel: state.label,
        stateTone: state.tone,
        emergencyReason: item.emergencyReason,
        profileStatus: selectedProfile?.status ?? null,
        profileStatusLabel: profileStatus.label,
        profileStatusTone: profileStatus.tone,
        builtInEditable: item.kind !== "provider"
          && methodsKnown
          && builtInMethods.get(item.kind)?.length === 1,
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
    builtInCards,
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
