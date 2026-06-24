import {
  getSelfServeOnboardingDisabledMessage,
  isSelfServeStoreOnboardingEnabled,
  SELF_SERVE_ONBOARDING_FLAG,
} from "@/lib/self-serve-onboarding";
import { SelfServeOnboardingDraft } from "@/components/self-serve/SelfServeOnboardingDraft";
import {
  OwnerCommandHero,
  OwnerStatusChip,
} from "@/components/owner-control";
import { requireOwnerAuth } from "@/lib/owner-auth";

export default async function NewSelfServeStorePage() {
  await requireOwnerAuth("/stores/new-self-serve");

  const enabled = isSelfServeStoreOnboardingEnabled();
  const disabledMessage = getSelfServeOnboardingDisabledMessage();

  return (
    <>
      <OwnerCommandHero
        overline="Self-Serve Phase 0/1"
        title="Self-serve mağaza açma taslağı"
        copy="Bu ekran Celebix'in kullanıcı tarafından başlatılan mağaza onboarding modelini doğrulamak için hazırlanmış güvenli bir skeleton'dır. Canlı store create, provisioning, Logto, DNS ve Coolify mutation yoktur."
        metrics={[
          { label: "Feature flag", value: enabled ? "Açık" : "Kapalı", note: SELF_SERVE_ONBOARDING_FLAG },
          { label: "Provisioning", value: "Kapalı", note: "Phase 0/1 guard" },
          { label: "Admin hedefi", value: "Central panel", note: "panel.celebix.co/stores/{slug}" },
        ]}
        actions={
          <>
            <OwnerStatusChip tone={enabled ? "warning" : "ink"}>
              {enabled ? "Skeleton görünür" : "Flag kapalı"}
            </OwnerStatusChip>
            <OwnerStatusChip tone="success">DB authority modeli</OwnerStatusChip>
            <OwnerStatusChip tone="danger">Live create yok</OwnerStatusChip>
          </>
        }
        panelTitle="Hedef mimari"
        panelItems={[
          { label: "Identity", value: "Logto" },
          { label: "Authority", value: "Celebix Platform DB" },
          { label: "Storefront", value: "{slug}.celebix.shop" },
          { label: "Admin", value: "panel.celebix.co/stores/{slug}" },
        ]}
        chips={
          <>
            <span className="hero-chip hero-chip-accent">Proposal only</span>
            <span className="hero-chip hero-chip-neutral">Durable job model next</span>
          </>
        }
      />

      <SelfServeOnboardingDraft enabled={enabled} disabledMessage={disabledMessage} />
    </>
  );
}
