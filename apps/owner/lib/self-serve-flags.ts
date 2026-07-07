export interface SelfServeFeatureFlags {
  signupEnabled: boolean;
  storeCreateEnabled: boolean;
  provisioningEnabled: boolean;
  requireOwnerApproval: boolean;
  previewMode: boolean;
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

export function getSelfServeFeatureFlags(): SelfServeFeatureFlags {
  const provisioningEnabled = readBooleanFlag("SELF_SERVE_PROVISIONING_ENABLED", false);
  const storeCreateEnabled = readBooleanFlag("SELF_SERVE_STORE_CREATE_ENABLED", false);

  return {
    signupEnabled: readBooleanFlag("SELF_SERVE_SIGNUP_ENABLED", true),
    storeCreateEnabled,
    provisioningEnabled,
    requireOwnerApproval: readBooleanFlag("SELF_SERVE_REQUIRE_OWNER_APPROVAL", true),
    previewMode: readBooleanFlag(
      "SELF_SERVE_PREVIEW_MODE",
      !storeCreateEnabled && !provisioningEnabled,
    ),
  };
}

export function getSelfServePersistenceMode(flags = getSelfServeFeatureFlags()) {
  if (flags.storeCreateEnabled || flags.provisioningEnabled) {
    return "blocked_by_phase_1_safety" as const;
  }

  return "safe_memory_adapter" as const;
}
