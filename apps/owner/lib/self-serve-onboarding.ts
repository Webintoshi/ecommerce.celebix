export const SELF_SERVE_ONBOARDING_FLAG = "NEXT_PUBLIC_SELF_SERVE_STORE_ONBOARDING_ENABLED";

export function isSelfServeStoreOnboardingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[SELF_SERVE_ONBOARDING_FLAG]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function getSelfServeOnboardingDisabledMessage(): string {
  return "Self-serve mağaza oluşturma Phase 0/1 kapsamında yalnızca taslak olarak görünür. Provisioning, canlı store create ve kaynak oluşturma kapalıdır.";
}
