import type { SelfServeFeatureFlags } from "@/lib/self-serve-flags";
import { normalizeSelfServeStoreSlug, suggestSelfServeStoreSlug } from "@/lib/self-serve-store-slug";

export type SelfServeRequestStatus =
  | "pending_provisioning"
  | "pending_owner_approval"
  | "ready"
  | "approved"
  | "rejected"
  | "cancelled";

export interface SelfServeApplicantInfo {
  fullName: string;
  email: string;
  phone: string;
}

export interface SelfServeBusinessInfo {
  businessName: string;
  businessType: string;
}

export interface SelfServeStoreInfo {
  storeName: string;
  slug: string;
  sector: string;
  defaultLanguage: string;
  currency: "TRY";
  contactEmail: string;
  contactPhone: string;
  proposedDomain?: string;
}

export interface SelfServeNeedsInfo {
  hasDomain: boolean;
  wantsDomain: boolean;
  wantsCorporateEmail: boolean;
  wantsProductMigration: boolean;
  approximateProductCount: string;
  designPreference: string;
}

export interface SelfServeOnboardingInput {
  applicant: SelfServeApplicantInfo;
  business: SelfServeBusinessInfo;
  store: SelfServeStoreInfo;
  needs: SelfServeNeedsInfo;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface SelfServeOnboardingRequest extends SelfServeOnboardingInput {
  id: string;
  status: SelfServeRequestStatus;
  createdAt: string;
  updatedAt: string;
  source: "self_serve_phase_1";
  mode?: "controlled_onboarding" | "direct_registration";
  ownerApprovalRequired: boolean;
  provisioningEnabled: boolean;
  storeCreateEnabled: boolean;
}

export const SELF_SERVE_REQUEST_STORAGE_KEY = "celebix:self-serve:onboarding-requests";
export const SELF_SERVE_LAST_REQUEST_STORAGE_KEY = "celebix:self-serve:last-onboarding-request";

export const BUSINESS_TYPE_OPTIONS = [
  "Sahis sirketi",
  "Limited sirket",
  "Anonim sirket",
  "Marka / uretici",
  "Perakende magaza",
  "Yeni girisim",
];

export const SECTOR_OPTIONS = [
  "Moda ve tekstil",
  "Kozmetik",
  "Ev ve yasam",
  "Gida",
  "Elektronik",
  "Spor",
  "Dijital urun",
  "Diger",
];

export const DESIGN_PREFERENCE_OPTIONS = [
  "Minimal ve premium",
  "Renkli ve dinamik",
  "Kurumsal ve sade",
  "Mevcut markama uygun",
  "Kararsizim, Celebix onersin",
];

export function createEmptySelfServeOnboardingInput(
  session?: Partial<SelfServeApplicantInfo> | null,
): SelfServeOnboardingInput {
  return {
    applicant: {
      fullName: session?.fullName ?? "",
      email: session?.email ?? "",
      phone: session?.phone ?? "",
    },
    business: {
      businessName: "",
      businessType: BUSINESS_TYPE_OPTIONS[0],
    },
    store: {
      storeName: "",
      slug: "",
      sector: SECTOR_OPTIONS[0],
      defaultLanguage: "tr",
      currency: "TRY",
      contactEmail: session?.email ?? "",
      contactPhone: session?.phone ?? "",
    },
    needs: {
      hasDomain: false,
      wantsDomain: true,
      wantsCorporateEmail: false,
      wantsProductMigration: false,
      approximateProductCount: "1-50",
      designPreference: DESIGN_PREFERENCE_OPTIONS[0],
    },
    termsAccepted: false,
    privacyAccepted: false,
  };
}

export function normalizeSelfServeOnboardingInput(
  input: SelfServeOnboardingInput,
): SelfServeOnboardingInput {
  const storeName = input.store.storeName.trim();
  const normalizedSlug =
    normalizeSelfServeStoreSlug(input.store.slug) || suggestSelfServeStoreSlug(storeName);

  return {
    applicant: {
      fullName: input.applicant.fullName.trim(),
      email: input.applicant.email.trim().toLowerCase(),
      phone: input.applicant.phone.trim(),
    },
    business: {
      businessName: input.business.businessName.trim(),
      businessType: input.business.businessType.trim(),
    },
    store: {
      storeName,
      slug: normalizedSlug,
      sector: input.store.sector.trim(),
      defaultLanguage: input.store.defaultLanguage.trim() || "tr",
      currency: "TRY",
      contactEmail: input.store.contactEmail.trim().toLowerCase(),
      contactPhone: input.store.contactPhone.trim(),
    },
    needs: {
      hasDomain: Boolean(input.needs.hasDomain),
      wantsDomain: Boolean(input.needs.wantsDomain),
      wantsCorporateEmail: Boolean(input.needs.wantsCorporateEmail),
      wantsProductMigration: Boolean(input.needs.wantsProductMigration),
      approximateProductCount: input.needs.approximateProductCount.trim(),
      designPreference: input.needs.designPreference.trim(),
    },
    termsAccepted: Boolean(input.termsAccepted),
    privacyAccepted: Boolean(input.privacyAccepted),
  };
}

export function validateSelfServeOnboardingInput(input: SelfServeOnboardingInput): string[] {
  const errors: string[] = [];

  if (!input.applicant.fullName) errors.push("Ad soyad gerekli.");
  if (!input.applicant.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.applicant.email)) {
    errors.push("Gecerli e-posta gerekli.");
  }
  if (!input.applicant.phone) errors.push("Telefon gerekli.");
  if (!input.business.businessName) errors.push("Isletme adi gerekli.");
  if (!input.store.storeName) errors.push("Magaza adi gerekli.");
  if (!input.store.slug) errors.push("Slug onerisi gerekli.");
  if (!input.store.contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.store.contactEmail)) {
    errors.push("Gecerli iletisim e-postasi gerekli.");
  }
  if (!input.store.contactPhone) errors.push("Iletisim telefonu gerekli.");
  if (!input.termsAccepted || !input.privacyAccepted) {
    errors.push("Kullanim sartlari ve gizlilik onayi gerekli.");
  }

  return errors;
}

export function buildSelfServeOnboardingRequest(
  id: string,
  input: SelfServeOnboardingInput,
  flags: SelfServeFeatureFlags,
  now = new Date(),
): SelfServeOnboardingRequest {
  const normalized = normalizeSelfServeOnboardingInput(input);
  const timestamp = now.toISOString();

  return {
    ...normalized,
    id,
    status: "pending_owner_approval",
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "self_serve_phase_1",
    ownerApprovalRequired: flags.requireOwnerApproval,
    provisioningEnabled: flags.provisioningEnabled,
    storeCreateEnabled: flags.storeCreateEnabled,
  };
}

export function getSelfServeStatusLabel(status: SelfServeRequestStatus): string {
  switch (status) {
    case "pending_provisioning":
      return "Kurulum hazirlaniyor";
    case "pending_owner_approval":
      return "Owner onayi bekliyor";
    case "ready":
      return "Admin panel hazir";
    case "approved":
      return "Onaylandi";
    case "rejected":
      return "Reddedildi";
    case "cancelled":
      return "Iptal edildi";
  }
}
