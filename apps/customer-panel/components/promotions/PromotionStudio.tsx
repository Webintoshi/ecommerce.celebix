"use client";
import { useState } from "react";
import { PROMOTION_TEMPLATES } from "@/lib/promotion-ui/model";
import { PromotionList } from "./PromotionList";
import { PromotionEditor } from "./PromotionEditor";
import { PromotionTemplatePicker } from "./PromotionTemplatePicker";
import { PanelPageHeader } from "@/components/panel/PanelPageShell";
import styles from "./promotion-studio.module.css";
export function LegacyPromotionWarning() { return <section className={styles.warning} role="status"><PanelPageHeader title="Kampanya" /><h1 className={styles.srOnly}>Kampanya</h1><strong>Eski indirim kaydı</strong><p>Bu kayıt yeni kampanyaya henüz bağlanmadı. Güvenli görüntüleme için destek ekibine başvurun.</p></section>; }
export function PromotionStudio({ mode, timezone, canManage, canPublish, canArchive, promotionId }: Readonly<{ mode: "list" | "create" | "view" | "edit"; timezone: string; canManage: boolean; canPublish: boolean; canArchive: boolean; promotionId?: string }>) {
  const [template, setTemplate] = useState<typeof PROMOTION_TEMPLATES[number]["id"] | null>(mode === "create" ? null : "custom");
  if (mode === "list") return <PromotionList timezone={timezone} canManage={canManage} canPublish={canPublish} canArchive={canArchive} />;
  if ((mode === "create" || mode === "edit") && !canManage) return <section className={styles.warning} role="status"><PanelPageHeader title="Kampanya" /><h1 className={styles.srOnly}>Kampanya</h1><strong>Salt okunur erişim</strong><p>Bu rol kampanyaları görüntüleyebilir ve test edebilir; taslak oluşturamaz veya düzenleyemez.</p><a href={promotionId ? `/discounts/${promotionId}` : "/discounts"}>Kampanyalara dön</a></section>;
  if (mode === "view" && !promotionId) return <LegacyPromotionWarning />;
  if (template === null) return <><PanelPageHeader title="Yeni kampanya" /><PromotionTemplatePicker templates={PROMOTION_TEMPLATES} onSelect={setTemplate} /></>;
  return <PromotionEditor templateId={template} promotionId={promotionId} timezone={timezone} canManage={canManage} canPublish={canPublish} canArchive={canArchive} readOnly={mode === "view"} />;
}
