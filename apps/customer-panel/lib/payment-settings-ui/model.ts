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

export type PaymentProviderConnectionView = Readonly<{
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
  submitLabel: "Bağlantıyı kaydet" | "Bilgileri yenile";
  publicFields: readonly Readonly<{ key: string; label: string; initialValue: string }>[];
  credentialFields: readonly Readonly<{
    key: string;
    label: string;
    secret: true;
    initialValue: "";
  }>[];
}>;

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
  const profileStatus = selectedProfile?.status === "active"
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
  return Object.freeze({
    providerCode: descriptor.providerCode,
    label: descriptor.label,
    environment,
    environmentLabel: environment === "test" ? "Test ortamı" : "Canlı ortam",
    callbackUrl: `https://${storefrontHostname}/api/payments/${descriptor.providerCode}/callback/{işleme-özel-bağlantı}`,
    statusLabel: profileStatus.label,
    statusTone: profileStatus.tone,
    maskedAccountReference: selectedProfile?.maskedAccountReference ?? null,
    credentialVersionLabel: selectedProfile ? `Sürüm ${selectedProfile.credentialVersion}` : null,
    lastValidatedAt: selectedProfile?.lastValidatedAt ?? null,
    canRotate,
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
  actionLabel: "Bilgileri gir" | "Bağla" | "Hazırlanıyor";
  lifecycleLabel: "Doğrulama bekliyor" | "Doğrulandı — sandbox kanıtı bekleniyor" | "Aktivasyona hazır" | "Aktif";
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
    && descriptor.environments?.length === 1
    && descriptor.environments[0] === authority.environment
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
  const activeProfile = profiles.some((candidate) =>
    candidate.providerCode === entry.providerCode
    && candidate.capability === "payment_processing"
    && candidate.status === "active");
  const activeMethod = methods.some((candidate) =>
    candidate.providerCode === entry.providerCode && candidate.state === "active");
  const lifecycleLabel = activeMethod ? "Aktif" as const
    : executable && activeProfile ? "Aktivasyona hazır" as const
    : activeProfile ? "Doğrulandı — sandbox kanıtı bekleniyor" as const
    : "Doğrulama bekliyor" as const;
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
    configurable,
    executable,
    connectable: configurable,
    actionLabel: executable ? "Bağla" : configurable ? "Bilgileri gir" : "Hazırlanıyor",
    lifecycleLabel,
    connectionEnvironment: configurable
      ? entry.readiness === "production_ready" ? "live" : configurableDescriptor.environments?.[0] ?? null
      : null,
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
) {
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
