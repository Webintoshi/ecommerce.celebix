"use client";

import Image from "next/image";
import { CreditCard, Search, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import type {
  PaymentProviderCatalogCard,
  PaymentSettingsFilters,
} from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";

export function PaymentProviderCatalogDialog(props: Readonly<{
  cards: readonly PaymentProviderCatalogCard[];
  totalCount: number;
  query: string;
  filters: PaymentSettingsFilters;
  phase: "loading" | "ready" | "error";
  canManage: boolean;
  busy: boolean;
  openerRef: RefObject<HTMLButtonElement | null>;
  onQuery(value: string): void;
  onFilters(value: PaymentSettingsFilters): void;
  onConnect(card: PaymentProviderCatalogCard): void;
  onClose(): void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function close() {
    if (props.busy) return;
    props.onClose();
    queueMicrotask(() => props.openerRef.current?.focus());
  }

  useEffect(() => {
    searchRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) { event.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return (
    <div className={styles.dialogLayer} onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div
        ref={dialogRef}
        className={styles.catalogDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-catalog-title"
        aria-describedby="payment-catalog-description"
        onKeyDown={onKeyDown}
      >
        <header className={styles.dialogHeader}>
          <div className={styles.dialogTitleIcon}><CreditCard aria-hidden="true" /></div>
          <div>
            <h2 id="payment-catalog-title">Ödeme Yöntemi Ekle</h2>
            <p id="payment-catalog-description">Celebix ödeme altyapıları arasından sağlayıcı ve entegrasyon modunu seçin.</p>
          </div>
          <button className={styles.iconButton} type="button" onClick={close} disabled={props.busy} aria-label="Ödeme yöntemi kataloğunu kapat"><X /></button>
        </header>

        {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: sağlayıcıları inceleyebilirsiniz ancak bağlantı kuramazsınız.</p> : null}

        <div className={styles.catalogFilters}>
          <label className={styles.catalogSearch}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>Ödeme sağlayıcısı ara</span>
            <input ref={searchRef} value={props.query} onChange={(event) => props.onQuery(event.currentTarget.value)} placeholder="Sağlayıcı veya ödeme modu ara" />
          </label>
          <select aria-label="Sağlayıcı kategorisi" value={props.filters.category} onChange={(event) => props.onFilters({ ...props.filters, category: event.currentTarget.value as PaymentSettingsFilters["category"] })}>
            <option value="all">Tüm kategoriler</option><option value="bank_pos">Banka POS</option><option value="payment_institution">Ödeme kuruluşu</option><option value="wallet">Dijital cüzdan</option><option value="international">Uluslararası</option>
          </select>
          <select aria-label="Entegrasyon modu" value={props.filters.interactionMode} onChange={(event) => props.onFilters({ ...props.filters, interactionMode: event.currentTarget.value as PaymentSettingsFilters["interactionMode"] })}>
            <option value="all">Tüm modlar</option><option value="redirect">Yönlendirme</option><option value="iframe">iFrame</option><option value="tokenized">Tokenize</option><option value="direct_pos">Doğrudan POS</option><option value="wallet">Cüzdan</option>
          </select>
          <select aria-label="Entegrasyon hazırlığı" value={props.filters.readiness} onChange={(event) => props.onFilters({ ...props.filters, readiness: event.currentTarget.value as PaymentSettingsFilters["readiness"] })}>
            <option value="all">Tüm durumlar</option><option value="production_ready">Canlı kullanıma hazır</option><option value="sandbox_ready">Test ortamına hazır</option><option value="verification">Doğrulanıyor</option><option value="planned">Hazırlanıyor</option><option value="maintenance">Bakımda</option>
          </select>
          <select aria-label="Sağlayıcı ortamı" value={props.filters.environment} onChange={(event) => props.onFilters({ ...props.filters, environment: event.currentTarget.value as PaymentSettingsFilters["environment"] })}>
            <option value="all">Tüm ortamlar</option><option value="test">Test</option><option value="live">Canlı</option>
          </select>
        </div>

        <div className={styles.catalogCount}>{props.cards.length} / {props.totalCount} entegrasyon gösteriliyor</div>
        <div className={styles.catalogBody}>
          {props.phase === "loading" ? <p className={styles.dialogState} role="status">Ödeme altyapıları yükleniyor…</p> : null}
          {props.phase === "error" ? <p className={styles.errorNotice} role="alert">Ödeme altyapısı kataloğu şu anda yüklenemiyor.</p> : null}
          {props.phase === "ready" && props.cards.length === 0 ? <p className={styles.dialogState}>Eşleşen sağlayıcı bulunamadı.</p> : null}
          {props.phase === "ready" ? <div className={styles.providerGrid}>
            {props.cards.map((card) => (
              <article className={styles.providerCard} key={card.providerCode}>
                <div className={styles.providerLogo}><Image src={card.logoPath} alt={`${card.label} logosu`} width={144} height={56} /></div>
                <div className={styles.providerCardHeading}><div><h3>{card.label}</h3><p>{card.modeLabel}</p></div><span className={styles[`tone-${card.readinessTone}`]}>{card.readinessLabel}</span></div>
                <div className={styles.providerMeta}><span>{card.categoryLabel}</span><span>{card.interactionLabel}</span><span>{card.environmentLabel}</span><span>{card.lifecycleLabel}</span></div>
                <button type="button" className={card.configurable ? styles.primaryButton : styles.plannedButton} disabled={!card.configurable || !props.canManage || props.busy} onClick={() => props.onConnect(card)}>{card.actionLabel}</button>
              </article>
            ))}
          </div> : null}
        </div>
      </div>
    </div>
  );
}
