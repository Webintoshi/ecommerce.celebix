"use client";

import Link from "next/link";
import { ArrowUpRight, Mail, MessageCircle, Phone, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import {
  MerchantAdminApiError,
  merchantAdminApi,
} from "@/lib/merchant-admin-ui/client";

import styles from "./merchant-module-console.module.css";
import operations from "./merchant-operations.module.css";

const CHANNELS = [
  { key: "email", label: "E-posta", kind: "email_campaign", href: "/marketing/email", Icon: Mail },
  { key: "phone", label: "Telefon", kind: "phone_campaign", href: "/marketing/phone", Icon: Phone },
  { key: "whatsapp", label: "WhatsApp", kind: "whatsapp_campaign", href: "/marketing/whatsapp", Icon: MessageCircle },
] as const;
type Counts = Readonly<Record<(typeof CHANNELS)[number]["key"], number | null>>;

export function MerchantMarketingOverview({
  canManage,
  embedded = false,
}: {
  canManage: boolean;
  embedded?: boolean;
}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setError("");
    setLoading(true);
    const results = await Promise.allSettled(CHANNELS.map(channel => merchantAdminApi.records(channel.kind)));
    if (sequence.current !== request) return;
    const next: Record<keyof Counts, number | null> = { email: null, phone: null, whatsapp: null };
    const failed: string[] = [];
    results.forEach((result, index) => {
      const channel = CHANNELS[index]!;
      if (result.status === "fulfilled") next[channel.key] = result.value.length;
      else failed.push(result.reason instanceof MerchantAdminApiError ? `${channel.label}: ${result.reason.message}` : `${channel.label} yüklenemedi.`);
    });
    setCounts(next);
    setError(failed.join(" "));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  return (
    <div className={operations.workspace}><PanelPageShell embedded={embedded}>
      {!embedded ? <h1 className={styles.srOnly}>Pazarlama</h1> : null}
      <PanelPageHeader
        title="Pazarlama Özeti"
        embedded={embedded}
        actions={<button type="button" className={styles.button} disabled={loading} onClick={() => void load()}><RefreshCcw size={17} aria-hidden="true" /> Yenile</button>}
      />
      <section className={styles.surface}>
        {error ? <div className={operations.feedback}><p className={styles.error} role="alert">{error}</p><button type="button" className={styles.button} disabled={loading} onClick={() => void load()}>Tekrar dene</button></div> : null}
        <div className={operations.channels} aria-busy={loading}>
          {CHANNELS.map(({ key, label, href, Icon }) => <article className={operations.channel} key={key}>
            <div className={operations.channelHead}><Icon aria-hidden="true" /><h2>{label}</h2></div>
            <strong>{counts?.[key] === null || counts === null ? "—" : counts[key]?.toLocaleString("tr-TR")}</strong>
            <span className={operations.channelStatus}><i aria-hidden="true" />{loading ? "Yükleniyor…" : counts?.[key] === null ? "Yüklenemedi" : "Kampanya kaydı"}</span>
            <Link className={operations.channelLink} href={href}>{canManage ? "Kampanyaları yönet" : "Kampanyaları gör"}<ArrowUpRight aria-hidden="true" /></Link>
          </article>)}
        </div>
        <details className={operations.history}><summary>Gönderim durumu</summary><p>Telefon ve WhatsApp kanalları, sağlayıcı adaptörü ve teslimat günlüğü bağlanana kadar yalnız taslak yönetimi sunar.</p></details>
      </section>
    </PanelPageShell></div>
  );
}
