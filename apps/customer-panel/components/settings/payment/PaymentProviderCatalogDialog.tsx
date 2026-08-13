"use client";

import Image from "next/image";
import { Banknote, ChevronRight, CreditCard, Search, Truck, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import type {
  BuiltInPaymentMethodCatalogCard,
  PaymentProviderCatalogCard,
  PaymentSettingsFilters,
} from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";

export function PaymentProviderCatalogDialog(props: Readonly<{
  cards: readonly PaymentProviderCatalogCard[];
  builtInCards: readonly BuiltInPaymentMethodCatalogCard[];
  totalCount: number;
  query: string;
  filters: PaymentSettingsFilters;
  phase: "loading" | "ready" | "error";
  canManage: boolean;
  mutationAvailable: boolean;
  providerConfigurationAvailable: boolean;
  busy: boolean;
  openerRef: RefObject<HTMLButtonElement | null>;
  onQuery(value: string): void;
  onFilters(value: PaymentSettingsFilters): void;
  onConnect(card: PaymentProviderCatalogCard): void;
  onBuiltInSelect(kind: BuiltInPaymentMethodCatalogCard["kind"]): void;
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

        <section className={styles.catalogBuiltInBody} aria-labelledby="built-in-payment-methods-title">
          <div className={styles.catalogSectionHeading}>
            <h3 id="built-in-payment-methods-title">Yerleşik yöntemler</h3>
            <span>Doğrudan kullanıma hazır</span>
          </div>
          <div className={styles.builtInGrid}>
            {props.builtInCards.map((card) => {
              const Icon = card.kind === "bank_transfer" ? Banknote : Truck;
              return <article className={styles.builtInCard} key={card.kind}>
                <div className={styles.builtInIcon}><Icon aria-hidden="true" /></div>
                <div className={styles.builtInCopy}>
                  <div><h3>{card.label}</h3>
                  <span className={styles[card.active === true ? "tone-success" : "tone-neutral"]}>
                    {card.active === true
                      ? "Etkin"
                      : card.configured === true ? "Devre dışı"
                      : card.configured === false ? "Henüz yapılandırılmadı" : "Durum bilinmiyor"}
                  </span></div>
                  <p>{card.description}</p>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!props.canManage || !props.mutationAvailable || !card.available || props.busy}
                  onClick={() => props.onBuiltInSelect(card.kind)}
                >
                  {card.actionLabel}<ChevronRight aria-hidden="true" />
                </button>
              </article>;
            })}
          </div>
        </section>

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

        <section className={styles.catalogResults} aria-labelledby="payment-provider-results-title">
          <div className={styles.catalogResultsHeader}>
            <h3 id="payment-provider-results-title">Ödeme sağlayıcıları</h3>
            <span className={styles.catalogCount}>{props.cards.length} / {props.totalCount} entegrasyon</span>
          </div>
          <div className={styles.catalogResultsBody}>
            {props.phase === "loading" ? <p className={styles.dialogState} role="status">Ödeme altyapıları yükleniyor…</p> : null}
            {props.phase === "error" ? <p className={styles.errorNotice} role="alert">Ödeme altyapısı kataloğu şu anda yüklenemiyor.</p> : null}
            {props.phase === "ready" && props.cards.length === 0 ? <p className={styles.dialogState}>Eşleşen sağlayıcı bulunamadı.</p> : null}
            {props.phase === "ready" ? <div className={styles.providerCatalogGrid}>
              {props.cards.map((card) => {
                const requiresMethodAuthority = card.actionLabel === "Etkinleştir";
                return <article className={styles.providerCard} key={card.providerCode}>
                  <div className={styles.providerCardTop}>
                    <div className={styles.providerLogo}><Image src={card.logoPath} alt={`${card.label} logosu`} width={104} height={36} /></div>
                    <span className={styles[`tone-${card.readinessTone}`]}>{card.readinessLabel}</span>
                  </div>
                  <div className={styles.providerCardHeading}><div><h3>{card.label}</h3><p>{card.modeLabel}</p></div></div>
                  <div className={styles.providerMeta}><span>{card.categoryLabel}</span><span>{card.interactionLabel}</span><span>{card.environmentLabel}</span><span>{card.lifecycleLabel}</span></div>
                  <button type="button" className={card.configurable ? styles.primaryButton : styles.plannedButton} disabled={!card.connectable || !props.canManage || !props.providerConfigurationAvailable || (requiresMethodAuthority && !props.mutationAvailable) || props.busy} onClick={() => props.onConnect(card)}>{card.actionLabel}{card.connectable ? <ChevronRight aria-hidden="true" /> : null}</button>
                </article>;
              })}
            </div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
