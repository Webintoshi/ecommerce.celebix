import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";
import {
  BUSINESS_TYPE_OPTIONS,
  DESIGN_PREFERENCE_OPTIONS,
  SECTOR_OPTIONS,
  buildSelfServeOnboardingRequest,
  type SelfServeOnboardingInput,
  type SelfServeOnboardingRequest,
} from "@/lib/self-serve-onboarding";
import { getSelfServeSlugIssue, normalizeSelfServeStoreSlug, suggestSelfServeStoreSlug } from "@/lib/self-serve-store-slug";

export interface SelfServeRegistrationInput {
  firstName: string;
  lastName: string;
  storeName: string;
  storeSlug: string;
  phone: string;
  email: string;
  password: string;
  marketingConsent: boolean;
  privacyConsent: boolean;
}

export interface SelfServeRegistrationValidationError {
  field: keyof SelfServeRegistrationInput;
  code: string;
  message: string;
}

export interface SelfServeRegistrationRecord extends SelfServeOnboardingRequest {
  mode: "direct_registration";
  status: "pending_provisioning";
  registration: {
    marketingConsent: boolean;
    privacyConsent: boolean;
    emailVerificationRequired: boolean;
    requirePaymentBeforePublic: boolean;
    autoProvisioningEnabled: boolean;
    adminHandoff: "pending_secure_handoff";
  };
  store: SelfServeOnboardingRequest["store"] & {
    proposedDomain: string;
  };
}

interface BuildRegistrationRecordOptions {
  now?: Date;
  defaultDomainSuffix: string;
  autoProvisioningEnabled: boolean;
  requirePaymentBeforePublic?: boolean;
  requireEmailVerification?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function compactSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTurkishPhone(input: string) {
  const compact = input.trim().replace(/[^\d+]/g, "");

  if (compact.startsWith("+90")) {
    return `+90${compact.slice(3).replace(/\D/g, "").slice(0, 10)}`;
  }

  if (compact.startsWith("90") && compact.length >= 12) {
    return `+90${compact.slice(2).replace(/\D/g, "").slice(0, 10)}`;
  }

  if (compact.startsWith("0") && compact.length >= 11) {
    return `+90${compact.slice(1).replace(/\D/g, "").slice(0, 10)}`;
  }

  const digits = compact.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+90${digits}`;
  }

  return compact;
}

export function normalizeSelfServeRegistrationInput(input: SelfServeRegistrationInput): SelfServeRegistrationInput {
  const storeName = compactSpaces(input.storeName);
  const storeSlug = normalizeSelfServeStoreSlug(input.storeSlug) || suggestSelfServeStoreSlug(storeName);

  return {
    firstName: compactSpaces(input.firstName),
    lastName: compactSpaces(input.lastName),
    storeName,
    storeSlug,
    phone: normalizeTurkishPhone(input.phone),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    marketingConsent: Boolean(input.marketingConsent),
    privacyConsent: Boolean(input.privacyConsent),
  };
}

function isPasswordStrongEnough(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function validateSelfServeRegistrationInput(
  input: SelfServeRegistrationInput,
): SelfServeRegistrationValidationError[] {
  const normalized = normalizeSelfServeRegistrationInput(input);
  const errors: SelfServeRegistrationValidationError[] = [];
  const slugIssue = getSelfServeSlugIssue(normalized.storeSlug);

  if (!normalized.firstName) {
    errors.push({ field: "firstName", code: "first_name_required", message: "Ad gerekli." });
  }

  if (!normalized.lastName) {
    errors.push({ field: "lastName", code: "last_name_required", message: "Soyad gerekli." });
  }

  if (!normalized.storeName) {
    errors.push({ field: "storeName", code: "store_name_required", message: "Magaza adi gerekli." });
  }

  if (slugIssue) {
    errors.push({ field: "storeSlug", code: "store_slug_invalid", message: slugIssue });
  }

  if (!/^\+905\d{9}$/.test(normalized.phone)) {
    errors.push({ field: "phone", code: "phone_invalid", message: "Telefon +90 ile baslayan gecerli TR GSM formunda olmali." });
  }

  if (!EMAIL_PATTERN.test(normalized.email)) {
    errors.push({ field: "email", code: "email_invalid", message: "Gecerli e-posta gerekli." });
  }

  if (!isPasswordStrongEnough(normalized.password)) {
    errors.push({ field: "password", code: "password_too_weak", message: "Sifre en az 8 karakter, harf ve rakam icermeli." });
  }

  if (!normalized.privacyConsent) {
    errors.push({ field: "privacyConsent", code: "privacy_consent_required", message: "KVKK / gizlilik onayi gerekli." });
  }

  return errors;
}

export function toSelfServeOnboardingInput(input: SelfServeRegistrationInput): SelfServeOnboardingInput {
  const normalized = normalizeSelfServeRegistrationInput(input);
  const fullName = `${normalized.firstName} ${normalized.lastName}`.trim();

  return {
    applicant: {
      fullName,
      email: normalized.email,
      phone: normalized.phone,
    },
    business: {
      businessName: normalized.storeName,
      businessType: BUSINESS_TYPE_OPTIONS.at(-1) ?? "Yeni girisim",
    },
    store: {
      storeName: normalized.storeName,
      slug: normalized.storeSlug,
      sector: SECTOR_OPTIONS[0],
      defaultLanguage: "tr",
      currency: "TRY",
      contactEmail: normalized.email,
      contactPhone: normalized.phone,
    },
    needs: {
      hasDomain: false,
      wantsDomain: true,
      wantsCorporateEmail: false,
      wantsProductMigration: false,
      approximateProductCount: "1-50",
      designPreference: DESIGN_PREFERENCE_OPTIONS[0],
    },
    termsAccepted: normalized.privacyConsent,
    privacyAccepted: normalized.privacyConsent,
  };
}

function normalizeDomainSuffix(suffix: string) {
  return suffix.trim().replace(/^\.+|\.+$/g, "").toLowerCase() || "celebix.site";
}

export function buildSelfServeRegistrationRecord(
  id: string,
  input: SelfServeRegistrationInput,
  options: BuildRegistrationRecordOptions,
): SelfServeRegistrationRecord {
  const normalized = normalizeSelfServeRegistrationInput(input);
  const domainSuffix = normalizeDomainSuffix(options.defaultDomainSuffix);
  const flags = {
    signupEnabled: true,
    directRegistrationEnabled: true,
    storeCreateEnabled: false,
    provisioningEnabled: false,
    autoProvisioningEnabled: options.autoProvisioningEnabled,
    requireOwnerApproval: false,
    previewMode: !options.autoProvisioningEnabled,
    requirePaymentBeforePublic: Boolean(options.requirePaymentBeforePublic),
    maxStoresPerUser: 1,
    requireEmailVerification: options.requireEmailVerification ?? true,
    defaultDomainSuffix: domainSuffix,
  } satisfies SelfServeFeatureFlags;
  const request = buildSelfServeOnboardingRequest(id, toSelfServeOnboardingInput(normalized), flags, options.now);

  return {
    ...request,
    mode: "direct_registration",
    status: "pending_provisioning",
    store: {
      ...request.store,
      proposedDomain: `${request.store.slug}.${domainSuffix}`,
    },
    registration: {
      marketingConsent: normalized.marketingConsent,
      privacyConsent: normalized.privacyConsent,
      emailVerificationRequired: flags.requireEmailVerification,
      requirePaymentBeforePublic: flags.requirePaymentBeforePublic,
      autoProvisioningEnabled: flags.autoProvisioningEnabled,
      adminHandoff: "pending_secure_handoff",
    },
  };
}
