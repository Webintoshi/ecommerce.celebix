"use client";

import Image from "next/image";
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Search,
  Truck,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type {
  BuiltInPaymentMethodCatalogCard,
  PaymentProviderCatalogCard,
  PaymentSettingsFilters,
} from "@/lib/payment-settings-ui/model";

import styles from "./payment-settings.module.css";

type ProviderCatalogProps = Readonly<{
  cards: readonly PaymentProviderCatalogCard[];
  totalCount: number;
  query: string;
  filters: PaymentSettingsFilters;
  phase: "loading" | "ready" | "error";
  canManage: boolean;
  mutationAvailable: boolean;
  providerConfigurationAvailable: boolean;
  busy: boolean;
  onQuery(value: string): void;
  onFilters(value: PaymentSettingsFilters): void;
  onConnect(card: PaymentProviderCatalogCard): void;
}>;

function providerLifecycleTone(card: PaymentProviderCatalogCard) {
  if (card.lifecycleLabel === "Aktif" || card.lifecycleLabel.startsWith("Aktif -")) return "success" as const;
  if (card.lifecycleLabel === "PayTR bilgileri doğrulanamadı") return "danger" as const;
  if (
    card.lifecycleLabel === "Kontrol ediliyor"
    || card.lifecycleLabel === "PayTR'a şu anda ulaşılamıyor"
    || card.lifecycleLabel === "Bakımda"
    || card.lifecycleLabel === "Doğrulama bekliyor"
    || card.lifecycleLabel === "Doğrulandı — sandbox kanıtı bekleniyor"
    || card.lifecycleLabel === "Bağlı — aktivasyon bekliyor"
    || card.lifecycleLabel === "Anahtar yenileme gerekli"
  ) return "warning" as const;
  return "neutral" as const;
}

function ProviderCatalogSurface(props: ProviderCatalogProps & Readonly<{
  headingId: string;
  searchRef?: RefObject<HTMLInputElement | null>;
}>) {
  return <div className={styles.providerCatalogSurface}>
    <div className={styles.catalogFilters}>
      <label className={styles.catalogSearch}>
        <Search aria-hidden="true" />
        <span className={styles.srOnly}>Ödeme sağlayıcısı ara</span>
        <input
          ref={props.searchRef}
          value={props.query}
          onChange={(event) => props.onQuery(event.currentTarget.value)}
          placeholder="Sağlayıcı veya ödeme modu ara"
        />
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

    <section className={styles.catalogResults} aria-labelledby={props.headingId}>
      <div className={styles.catalogResultsHeader}>
        <h3 id={props.headingId}>Ödeme sağlayıcıları</h3>
        <span className={styles.catalogCount}>{props.cards.length} / {props.totalCount} entegrasyon</span>
      </div>
      <div className={styles.catalogResultsBody}>
        {props.phase === "loading" ? <p className={styles.dialogState} role="status">Ödeme altyapıları yükleniyor…</p> : null}
        {props.phase === "error" ? <p className={styles.errorNotice} role="alert">Ödeme altyapısı kataloğu şu anda yüklenemiyor.</p> : null}
        {props.phase === "ready" && props.cards.length === 0 ? <p className={styles.dialogState}>Eşleşen sağlayıcı bulunamadı.</p> : null}
        {props.phase === "ready" ? <div className={styles.providerCatalogGrid}>
          {props.cards.map((card) => {
            const requiresMethodAuthority = card.actionLabel === "Etkinleştir";
            const tone = providerLifecycleTone(card);
            return <article className={styles.providerCard} key={card.providerCode}>
              <div className={styles.providerCardTop}>
                <div className={styles.providerLogo}><Image src={card.logoPath} alt={`${card.label} logosu`} width={96} height={32} /></div>
                <span className={styles[`tone-${tone}`]}>{card.lifecycleLabel}</span>
              </div>
              <div className={styles.providerCardHeading}>
                <div><h3>{card.label}</h3><p>{card.modeLabel}</p></div>
              </div>
              <div className={styles.providerMeta}>
                <span>{card.categoryLabel}</span>
                {card.configurable ? <span>{card.environmentLabel}</span> : null}
              </div>
              <button
                type="button"
                className={card.configurable ? styles.secondaryButton : styles.plannedButton}
                disabled={!card.connectable || !props.canManage || !props.providerConfigurationAvailable || (requiresMethodAuthority && !props.mutationAvailable) || props.busy}
                onClick={() => props.onConnect(card)}
              >
                {card.actionLabel}{card.connectable ? <ChevronRight aria-hidden="true" /> : null}
              </button>
            </article>;
          })}
        </div> : null}
      </div>
    </section>
  </div>;
}

export function PaymentProviderWorkspace(props: ProviderCatalogProps) {
  return <section className={styles.providerWorkspace} aria-labelledby="payment-provider-workspace-title">
    <header className={styles.workspaceSectionHeader}>
      <div>
        <h2 id="payment-provider-workspace-title">Sağlayıcı bağlantıları</h2>
        <p>Kart ve online ödeme altyapılarını bulun, bağlantı durumlarını inceleyin ve mevcut kurulum akışlarını yönetin.</p>
      </div>
    </header>
    <ProviderCatalogSurface {...props} headingId="payment-provider-results-title" />
  </section>;
}

export function PaymentProviderCatalogDialog(props: ProviderCatalogProps & Readonly<{
  builtInCards: readonly BuiltInPaymentMethodCatalogCard[];
  openerRef: RefObject<HTMLButtonElement | null>;
  onBuiltInSelect(kind: BuiltInPaymentMethodCatalogCard["kind"]): void;
  onClose(): void;
}>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const manualTabRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<"manual" | "online">("manual");

  function close() {
    if (props.busy) return;
    props.onClose();
    queueMicrotask(() => props.openerRef.current?.focus());
  }

  function selectOnline() {
    setSelection("online");
    queueMicrotask(() => searchRef.current?.focus());
  }

  useEffect(() => {
    manualTabRef.current?.focus();
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
            <p id="payment-catalog-description">Checkout’a yerleşik bir yöntem ekleyin veya online ödeme sağlayıcısı kurun.</p>
          </div>
          <button className={styles.iconButton} type="button" onClick={close} disabled={props.busy} aria-label="Ödeme yöntemi kataloğunu kapat"><X /></button>
        </header>

        {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: yöntemleri inceleyebilirsiniz ancak bağlantı kuramazsınız.</p> : null}

        <div className={styles.addFlowTabs} role="tablist" aria-label="Ödeme yöntemi türü">
          <button ref={manualTabRef} type="button" role="tab" aria-selected={selection === "manual"} className={selection === "manual" ? styles.activeAddFlowTab : undefined} onClick={() => setSelection("manual")}><Banknote aria-hidden="true" />Manuel yöntemler</button>
          <button type="button" role="tab" aria-selected={selection === "online"} className={selection === "online" ? styles.activeAddFlowTab : undefined} onClick={selectOnline}><CreditCard aria-hidden="true" />Online ödeme</button>
        </div>

        <section hidden={selection !== "manual"} className={styles.catalogBuiltInBody} aria-labelledby="built-in-payment-methods-title">
          <div className={styles.catalogSectionHeading}>
            <div><h3 id="built-in-payment-methods-title">Yerleşik yöntemler</h3><p>Sağlayıcı bağlantısı gerektirmeden Celebix checkout’unda kullanılır.</p></div>
            <span>{props.builtInCards.length} yöntem</span>
          </div>
          <div className={styles.builtInGrid}>
            {props.builtInCards.map((card) => {
              const Icon = card.kind === "bank_transfer" ? Banknote : Truck;
              const status = card.active === true
                ? "Etkin"
                : card.configured === true ? "Devre dışı"
                : card.configured === false ? "Henüz yapılandırılmadı" : "Durum bilinmiyor";
              return <article className={styles.builtInCard} key={card.kind}>
                <div className={styles.builtInIcon}><Icon aria-hidden="true" /></div>
                <div className={styles.builtInCopy}>
                  <div><h3>{card.label}</h3><span className={styles[card.active === true ? "tone-success" : "tone-neutral"]}>{status}</span></div>
                  <p>{card.description}</p>
                  <small>Manuel ödeme · Yerleşik</small>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={!props.canManage || !props.mutationAvailable || !card.available || props.busy}
                  onClick={() => props.onBuiltInSelect(card.kind)}
                >
                  {card.configured === true ? "Yönet" : card.actionLabel}<ChevronRight aria-hidden="true" />
                </button>
              </article>;
            })}
          </div>
        </section>
        <div hidden={selection !== "online"} className={styles.onlineAddFlow}>
          <ProviderCatalogSurface {...props} headingId="payment-provider-dialog-results-title" searchRef={searchRef} />
        </div>
      </div>
    </div>
  );
}
