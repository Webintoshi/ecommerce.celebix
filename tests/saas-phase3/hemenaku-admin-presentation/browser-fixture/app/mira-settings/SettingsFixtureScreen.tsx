"use client";

import { AnalyticsSettingsConsole } from "@/components/analytics/AnalyticsSettingsConsole";
import { PolicyConsole } from "@/components/content/PolicyConsole";
import { MerchantFamilyOverview } from "@/components/merchant-admin/MerchantFamilyOverview";
import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { MerchantRecordEditor } from "@/components/merchant-admin/MerchantRecordEditor";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { StoreDomainSettings } from "@/components/settings/domains/StoreDomainSettings";
import { PaymentSettingsConsole } from "@/components/settings/payment/PaymentSettingsConsole";
import { ShippingSettingsConsole } from "@/components/shipping/ShippingSettingsConsole";
import { ArtificialIntelligenceSettings } from "@/components/toshi-settings/ArtificialIntelligenceSettings";
import { ToshiWorkspace } from "@/components/toshi/ToshiWorkspace";

import { MODEL } from "../mira-catalog/catalog-fixture";
import styles from "./fixture.module.css";

export const SETTINGS_FIXTURE_VIEWS = Object.freeze([
  "settings",
  "content",
  "general",
  "content-new",
  "lucky-wheel",
  "policies",
  "policy-edit",
  "domains",
  "payment",
  "shipping",
  "artificial-intelligence",
  "toshi",
  "analytics",
  "design-unavailable",
] as const);

function SettingsSurface({ view }: Readonly<{ view: string }>) {
  switch (view) {
    case "settings": return <MerchantFamilyOverview family="settings" canManage />;
    case "content": return <MerchantFamilyOverview family="content" canManage />;
    case "general": return <MerchantModuleConsole kind="general_setting" canManage />;
    case "content-new": return <MerchantRecordEditor kind="blog_post" returnTo="/content/blog" canManage />;
    case "lucky-wheel": return <MerchantModuleConsole kind="lucky_wheel" canManage={false} />;
    case "policies": return <PolicyConsole canManage />;
    case "policy-edit": return <PolicyConsole initialPolicyKey="privacy_security" canManage />;
    case "domains": return <StoreDomainSettings canManage={false} />;
    case "payment": return <PaymentSettingsConsole canManage={false} storefrontHostname="mira-settings.example.test" />;
    case "shipping": return <ShippingSettingsConsole canManage={false} />;
    case "artificial-intelligence": return <ArtificialIntelligenceSettings canManage={false} />;
    case "toshi": return <ToshiWorkspace />;
    case "analytics": return <AnalyticsSettingsConsole />;
    case "design-unavailable": return (
      <PanelPageShell>
        <PanelPageHeader title="Tasarım" description="Bu yerel fixture gerçek mağaza tasarımını veya yüklenen varlıkları taklit etmez." />
        <p role="note">Tasarım düzenleyicisi için güvenli, mağazaya özel çalışma alanı fixture&apos;ı bulunmuyor.</p>
      </PanelPageShell>
    );
    default: return (
      <PanelPageShell>
        <PanelPageHeader title="Desteklenmeyen fixture görünümü" description="Bu yerel kabul görünümü tanımlı değil." />
      </PanelPageShell>
    );
  }
}

export function SettingsFixtureScreen({ view }: Readonly<{ view: string }>) {
  return (
    <PanelLayoutClient model={MODEL}>
      <aside className={styles.notice} role="note">Kontrollü sunum fixture&apos;ı · provider, alan adı ve ödeme işlemleri kalıcı değildir.</aside>
      <SettingsSurface view={view} />
    </PanelLayoutClient>
  );
}
