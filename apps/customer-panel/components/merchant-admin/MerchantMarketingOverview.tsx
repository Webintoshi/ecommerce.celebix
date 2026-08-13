"use client";

import { useCallback, useEffect, useState } from "react";

import {
  PanelActionButton,
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import {
  MerchantAdminApiError,
  merchantAdminApi,
} from "@/lib/merchant-admin-ui/client";

import styles from "./merchant-module-console.module.css";

type Counts = Readonly<{ email: number; phone: number; whatsapp: number }>;

export function MerchantMarketingOverview({
  canManage,
  embedded = false,
}: {
  canManage: boolean;
  embedded?: boolean;
}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [email, phone, whatsapp] = await Promise.all([
        merchantAdminApi.records("email_campaign"),
        merchantAdminApi.records("phone_campaign"),
        merchantAdminApi.records("whatsapp_campaign"),
      ]);
      setCounts(Object.freeze({
        email: email.length,
        phone: phone.length,
        whatsapp: whatsapp.length,
      }));
    } catch (caught) {
      setError(caught instanceof MerchantAdminApiError
        ? caught.message
        : "Pazarlama özeti yüklenemedi.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <PanelPageShell embedded={embedded}>
      <PanelPageHeader
        title="Pazarlama Özeti"
        description="İzinli kitlelere ait kalıcı kampanya taslaklarını kanala göre yönetin."
        embedded={embedded}
      />
      <section className={styles.surface}>
        {error ? <p className={styles.error} role="alert">{error}</p> : counts === null ? (
          <div className={styles.state} role="status">Pazarlama özeti yükleniyor…</div>
        ) : (
          <div className={styles.overview}>
            {[
              ["E-posta", counts.email, "/marketing/email"],
              ["Telefon", counts.phone, "/marketing/phone"],
              ["WhatsApp", counts.whatsapp, "/marketing/whatsapp"],
            ].map(([label, count, href]) => (
              <article className={styles.overviewCard} key={String(href)}>
                <span>{label}</span>
                <strong>{Number(count).toLocaleString("tr-TR")}</strong>
                <small>Kalıcı kampanya kaydı</small>
                <PanelActionButton href={String(href)}>{canManage ? "Yönet" : "Görüntüle"}</PanelActionButton>
              </article>
            ))}
          </div>
        )}
        <p className={styles.notice}>Telefon ve WhatsApp kanalları, sağlayıcı adaptörü ve teslimat günlüğü bağlanana kadar yalnız güvenli taslak yönetimi sunar.</p>
      </section>
    </PanelPageShell>
  );
}
