export interface SelfServeFeatureFlags {
  signupEnabled: boolean;
  directRegistrationEnabled: boolean;
  storeCreateEnabled: boolean;
  provisioningEnabled: boolean;
  autoProvisioningEnabled: boolean;
  requireOwnerApproval: boolean;
  previewMode: boolean;
  requirePaymentBeforePublic: boolean;
  maxStoresPerUser: number;
  requireEmailVerification: boolean;
  defaultDomainSuffix: string;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

function readBooleanFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();

  if (!raw) {
    return defaultValue;
  }

  if (TRUE_VALUES.has(raw)) {
    return true;
  }

  if (FALSE_VALUES.has(raw)) {
    return false;
  }

  return defaultValue;
}

function readNumberFlag(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function readStringFlag(name: string, defaultValue: string): string {
  const raw = process.env[name]?.trim();

  return raw || defaultValue;
}

export function getSelfServeFeatureFlags(): SelfServeFeatureFlags {
  const provisioningEnabled = readBooleanFlag("SELF_SERVE_PROVISIONING_ENABLED", false);
  const storeCreateEnabled = readBooleanFlag("SELF_SERVE_STORE_CREATE_ENABLED", false);
  const autoProvisioningEnabled = readBooleanFlag("SELF_SERVE_AUTO_PROVISIONING_ENABLED", false);

  return {
    signupEnabled: readBooleanFlag("SELF_SERVE_SIGNUP_ENABLED", true),
    directRegistrationEnabled: readBooleanFlag("SELF_SERVE_DIRECT_REGISTRATION_ENABLED", true),
    storeCreateEnabled,
    provisioningEnabled,
    autoProvisioningEnabled,
    requireOwnerApproval: readBooleanFlag("SELF_SERVE_REQUIRE_OWNER_APPROVAL", true),
    previewMode: readBooleanFlag(
      "SELF_SERVE_PREVIEW_MODE",
      !storeCreateEnabled && !provisioningEnabled && !autoProvisioningEnabled,
    ),
    requirePaymentBeforePublic: readBooleanFlag("SELF_SERVE_REQUIRE_PAYMENT_BEFORE_PUBLIC", false),
    maxStoresPerUser: readNumberFlag("SELF_SERVE_MAX_STORES_PER_USER", 1),
    requireEmailVerification: readBooleanFlag("SELF_SERVE_REQUIRE_EMAIL_VERIFICATION", true),
    defaultDomainSuffix: readStringFlag("SELF_SERVE_DEFAULT_DOMAIN_SUFFIX", "celebix.site"),
  };
}

export function getSelfServePersistenceMode(flags = getSelfServeFeatureFlags()) {
  if (flags.storeCreateEnabled || flags.provisioningEnabled || flags.autoProvisioningEnabled) {
    return "blocked_by_phase_1_safety" as const;
  }

  return "safe_memory_adapter" as const;
}
