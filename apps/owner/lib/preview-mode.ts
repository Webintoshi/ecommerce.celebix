export type OwnerPreviewAction =
  | "write"
  | "create_store"
  | "provisioning"
  | "deploy"
  | "cleanup"
  | "repair";

export interface OwnerPreviewFlags {
  previewMode: boolean;
  writeActionsDisabled: boolean;
  createStoreDisabled: boolean;
  provisioningDisabled: boolean;
  deployActionsDisabled: boolean;
  cleanupActionsDisabled: boolean;
  repairActionsDisabled: boolean;
}

interface OwnerPreviewErrorPayload {
  code: "preview_write_disabled" | "action_disabled_in_preview";
  message: string;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? TRUE_VALUES.has(value) : false;
}

export function isOwnerPreviewMode(): boolean {
  return readBooleanEnv("OWNER_PREVIEW_MODE");
}

export function getOwnerPreviewFlags(): OwnerPreviewFlags {
  const previewMode = isOwnerPreviewMode();
  const writeActionsDisabled = previewMode || readBooleanEnv("WRITE_ACTIONS_DISABLED");

  return {
    previewMode,
    writeActionsDisabled,
    createStoreDisabled: writeActionsDisabled || readBooleanEnv("CREATE_STORE_DISABLED"),
    provisioningDisabled: writeActionsDisabled || readBooleanEnv("PROVISIONING_DISABLED"),
    deployActionsDisabled: writeActionsDisabled || readBooleanEnv("DEPLOY_ACTIONS_DISABLED"),
    cleanupActionsDisabled: writeActionsDisabled || readBooleanEnv("CLEANUP_ACTIONS_DISABLED"),
    repairActionsDisabled: writeActionsDisabled || readBooleanEnv("REPAIR_ACTIONS_DISABLED"),
  };
}

export function isOwnerActionDisabled(
  action: OwnerPreviewAction,
  flags: OwnerPreviewFlags = getOwnerPreviewFlags(),
): boolean {
  switch (action) {
    case "write":
      return flags.writeActionsDisabled;
    case "create_store":
      return flags.createStoreDisabled;
    case "provisioning":
      return flags.provisioningDisabled;
    case "deploy":
      return flags.deployActionsDisabled;
    case "cleanup":
      return flags.cleanupActionsDisabled;
    case "repair":
      return flags.repairActionsDisabled;
    default:
      return false;
  }
}

export function getOwnerPreviewBannerTitle(): string {
  return "Preview Mode";
}

export function getOwnerPreviewBannerMessage(): string {
  return "Yazma ve kurulum aksiyonlari kapali. Bu ortam yalnizca gorsel QA icindir.";
}

export function getOwnerActionDisabledPayload(
  action: OwnerPreviewAction,
  flags: OwnerPreviewFlags = getOwnerPreviewFlags(),
): OwnerPreviewErrorPayload | null {
  if (!isOwnerActionDisabled(action, flags)) {
    return null;
  }

  if (flags.previewMode || flags.writeActionsDisabled) {
    return {
      code: "preview_write_disabled",
      message: "Preview ortaminda yazma/kurulum islemleri kapalidir.",
    };
  }

  return {
    code: "action_disabled_in_preview",
    message: "Preview ortaminda yazma/kurulum islemleri kapalidir.",
  };
}

export function getOwnerPreviewDisabledNotice(
  action: OwnerPreviewAction,
  flags: OwnerPreviewFlags = getOwnerPreviewFlags(),
): string | null {
  return getOwnerActionDisabledPayload(action, flags)?.message ?? null;
}
