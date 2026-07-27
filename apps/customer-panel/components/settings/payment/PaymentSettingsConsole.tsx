"use client";

import type {
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
  PaymentMethodState,
} from "@celebix/saas-contracts";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  GripVertical,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import {
  PaymentMethodApiError,
  paymentMethodApi,
} from "@/lib/payment-method-ui/client";
import {
  createLoadingPaymentSettingsSources,
  loadPaymentSettingsSources,
  type PaymentSettingsSources,
} from "@/lib/payment-settings-ui/console-state";
import {
  buildPaymentSettingsViewModel,
  type PaymentProviderCatalogCard,
  type PaymentSettingsFilters,
} from "@/lib/payment-settings-ui/model";
import { providerExecutionApi } from "@/lib/provider-execution-ui/client";

import { PaymentMethodOrderDialog } from "./PaymentMethodOrderDialog";
import { PaymentProviderCatalogDialog } from "./PaymentProviderCatalogDialog";
import { PaymentProviderConnectionDrawer } from "./PaymentProviderConnectionDrawer";
import styles from "./payment-settings.module.css";

type Sources = PaymentSettingsSources<
  PaymentProviderCatalogEntry,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  MerchantPaymentMethod
>;

const FILTERS: PaymentSettingsFilters = Object.freeze({
  category: "all",
  interactionMode: "all",
  readiness: "all",
  environment: "all",
});

function PaymentConsoleActions(props: Readonly<{
  canManage: boolean;
  loading: boolean;
  addRef?: RefObject<HTMLButtonElement | null>;
  orderRef?: RefObject<HTMLButtonElement | null>;
  onOrder(): void;
  onAdd(): void;
}>) {
  return <div className={styles.commandBar} aria-label="Ödeme ayarları işlemleri">
    <button ref={props.orderRef} className={styles.secondaryButton} type="button" disabled={!props.canManage || props.loading} onClick={props.onOrder}><GripVertical aria-hidden="true" />Önizleme ve Sıralama</button>
    <button ref={props.addRef} className={styles.primaryButton} type="button" disabled={!props.canManage || props.loading} onClick={props.onAdd}><Plus aria-hidden="true" />Ödeme Yöntemi Ekle</button>
  </div>;
}

function safeMessage(error: unknown): string {
  return error instanceof PaymentMethodApiError ? error.message : "Ödeme yöntemi güncellenemedi.";
}

export function PaymentSettingsConsole(props: Readonly<{
  canManage: boolean;
  initialDialog?: "provider-catalog" | null;
  initialMethodId?: string | null;
}>) {
  const [sources, setSources] = useState<Sources>(() => createLoadingPaymentSettingsSources());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PaymentSettingsFilters>(FILTERS);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<PaymentProviderCatalogCard | null>(null);
  const [busyMethodId, setBusyMethodId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [highlightedMethodId, setHighlightedMethodId] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadVersion = useRef(0);
  const initialSurfaceHandled = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const orderButtonRef = useRef<HTMLButtonElement>(null);
  const methodRefs = useRef(new Map<string, HTMLTableRowElement>());

  const load = useCallback(async () => {
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setSources(createLoadingPaymentSettingsSources());
    const result = await loadPaymentSettingsSources({
      catalog: () => paymentMethodApi.catalog(),
      definitions: () => providerExecutionApi.definitions("payment_processing"),
      profiles: () => providerExecutionApi.profiles("payment_processing"),
      methods: () => paymentMethodApi.list(),
    });
    if (mounted.current && loadVersion.current === version) setSources(result);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadVersion.current += 1; };
  }, [load]);

  const view = useMemo(() => buildPaymentSettingsViewModel(
    sources.catalog.phase === "ready" ? sources.catalog.value : [],
    sources.definitions.phase === "ready" ? sources.definitions.value : [],
    sources.profiles.phase === "ready" ? sources.profiles.value : [],
    sources.methods.phase === "ready" ? sources.methods.value : [],
    query,
    filters,
  ), [filters, query, sources]);

  useEffect(() => {
    if (initialSurfaceHandled.current) return;
    if (props.initialDialog === "provider-catalog" && sources.catalog.phase === "ready") {
      initialSurfaceHandled.current = true;
      setCatalogOpen(true);
      return;
    }
    if (props.initialMethodId && sources.methods.phase === "ready") {
      initialSurfaceHandled.current = true;
      const exists = sources.methods.value.some(({ id }) => id === props.initialMethodId);
      if (exists) {
        setHighlightedMethodId(props.initialMethodId);
        requestAnimationFrame(() => methodRefs.current.get(props.initialMethodId!)?.focus());
      } else window.history.replaceState(null, "", "/settings/payment");
    }
  }, [props.initialDialog, props.initialMethodId, sources.catalog.phase, sources.methods]);

  async function updateState(method: MerchantPaymentMethod, state: PaymentMethodState) {
    if (!props.canManage || busyMethodId) return;
    let emergencyReason: string | null = null;
    if (state === "emergency_disabled") {
      const reason = window.prompt("Acil kapatma nedenini yazın (3-240 karakter):")?.trim() ?? "";
      if (reason.length < 3 || reason.length > 240) { setMessage("Acil kapatma nedeni 3-240 karakter olmalıdır."); return; }
      if (!window.confirm(`${method.label} acil durumda kapatılsın mı?`)) return;
      emergencyReason = reason;
    } else if (!window.confirm(`${method.label} durumu “${state === "active" ? "Etkin" : "Devre dışı"}” olarak değiştirilsin mi?`)) return;
    setBusyMethodId(method.id);
    setMessage("");
    try {
      await paymentMethodApi.setState(method.id, {
        expectedVersion: method.version,
        state,
        emergencyReason,
      });
      setMessage("Ödeme yöntemi durumu güncellendi.");
      await load();
    } catch (error) {
      setMessage(safeMessage(error));
      if (error instanceof PaymentMethodApiError && error.code === "version_conflict") await load();
    } finally { setBusyMethodId(null); }
  }

  const methodsLoading = sources.methods.phase === "loading";
  const topbarActions = <PaymentConsoleActions canManage={props.canManage} loading={methodsLoading} addRef={addButtonRef} orderRef={orderButtonRef} onOrder={() => setOrderOpen(true)} onAdd={() => setCatalogOpen(true)} />;
  const selectedProfile = selectedCard?.executableDescriptor
    ? sources.profiles.value.find((profile) => profile.providerCode === selectedCard.providerCode)
    : undefined;

  return (
    <section className={styles.page} aria-labelledby="payment-settings-title">
      <PanelTopbarBridge title="Ödeme Ayarları" subtitle="Ödeme yöntemlerini, durumlarını ve checkout sırasını yönetin." actions={topbarActions} />
      <h1 id="payment-settings-title" className={styles.srOnly}>Ödeme Ayarları</h1>
      <div className={styles.mobileCommands}>{topbarActions}</div>

      <section className={styles.availabilityCard} aria-labelledby="payment-availability-title">
        <div className={styles.availabilityIcon}><CircleDollarSign aria-hidden="true" /></div>
        <div className={styles.availabilityCopy}>
          <h2 id="payment-availability-title">Ödeme kullanılabilirliği</h2>
          <p>Checkout’ta görünen yöntemler yalnız etkin ve acil durumda kapatılmamış kalıcı kayıtlardan oluşur.</p>
        </div>
        <div className={styles.availabilityStatus}>
          <span className={view.counts.activeMethods > 0 ? styles["tone-success"] : styles["tone-neutral"]}>{view.availabilityLabel}</span>
          <small>{view.counts.pendingProfiles > 0 ? `${view.counts.pendingProfiles} bağlantı doğrulama bekliyor` : `${view.counts.profiles} sağlayıcı bağlantısı`}</small>
        </div>
      </section>

      {message ? <p className={message.includes("güncellendi") ? styles.successNotice : styles.errorNotice} role={message.includes("güncellendi") ? "status" : "alert"}>{message.includes("güncellendi") ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}{message}</p> : null}
      {sources.catalog.phase === "error" || sources.profiles.phase === "error" || sources.definitions.phase === "error" ? <p className={styles.providerWarning} role="status"><ShieldAlert aria-hidden="true" />Sağlayıcı bağlantı bilgileri şu anda sınırlı; mevcut ödeme yöntemleri ayrı olarak çalışmaya devam eder.</p> : null}

      <section className={styles.methodsPanel} aria-labelledby="payment-methods-title">
        <header className={styles.methodsHeader}>
          <div><h2 id="payment-methods-title">Ödeme Yöntemleri</h2><p>Ödeme yöntemlerini ekleyebilir ve ödeme adımındaki sıralarını ayarlayabilirsiniz.</p></div>
          <PaymentConsoleActions canManage={props.canManage} loading={methodsLoading} onOrder={() => setOrderOpen(true)} onAdd={() => setCatalogOpen(true)} />
        </header>

        {sources.methods.phase === "loading" ? <p className={styles.loadingState} role="status">Ödeme yöntemleri yükleniyor…</p> : null}
        {sources.methods.phase === "error" ? <div className={styles.loadError} role="alert"><span>Ödeme yöntemleri yüklenemedi.</span><button type="button" className={styles.secondaryButton} onClick={() => void load()}><RefreshCw />Tekrar dene</button></div> : null}
        {sources.methods.phase === "ready" && view.methods.length === 0 ? <div className={styles.emptyMethods}><CreditCard aria-hidden="true" /><h3>Henüz yöntem yok</h3><p>Hazır bir sağlayıcı etkinleştirildiğinde veya yerleşik yöntem eklendiğinde burada görünür.</p>{props.canManage ? <button type="button" className={styles.primaryButton} onClick={() => setCatalogOpen(true)}><Plus />Ödeme Yöntemi Ekle</button> : <span>Salt okunur erişim</span>}</div> : null}

        {sources.methods.phase === "ready" && view.methods.length > 0 ? <>
          <div className={styles.methodTableWrap}>
            <table className={styles.methodTable} aria-label="Ödeme yöntemleri">
              <thead><tr><th>Ödeme Yöntemleri</th><th>Acil Durum</th><th>Durum</th><th><span className={styles.srOnly}>İşlemler</span></th></tr></thead>
              <tbody>{view.methods.map((row) => {
                const method = sources.methods.value.find(({ id }) => id === row.id)!;
                const busy = busyMethodId === row.id;
                return <tr key={row.id} ref={(element) => { if (element) methodRefs.current.set(row.id, element); else methodRefs.current.delete(row.id); }} tabIndex={highlightedMethodId === row.id ? 0 : -1} data-highlighted={highlightedMethodId === row.id ? "true" : undefined}>
                  <td><div className={styles.methodIdentity}>{row.logoPath ? <span className={styles.methodLogo}><Image src={row.logoPath} alt="" width={41} height={30} /></span> : <span className={styles.methodLogo}><CreditCard aria-hidden="true" /></span>}<span><strong>{row.label}</strong><small>{row.providerLabel} · {row.modeLabel} · {row.environmentLabel}</small></span></div></td>
                  <td><button type="button" className={row.state === "emergency_disabled" ? styles.emergencyActive : styles.emergencyButton} disabled={!props.canManage || busy} onClick={() => void updateState(method, row.state === "emergency_disabled" ? "active" : "emergency_disabled")}><ShieldAlert />{row.state === "emergency_disabled" ? "Acil kapatmayı kaldır" : "Acil kapat"}</button></td>
                  <td><span className={styles[`tone-${row.stateTone}`]}>{row.stateLabel}</span><small className={styles.profileState}>{row.profileStatusLabel}</small></td>
                  <td><button type="button" className={styles.secondaryButton} disabled={!props.canManage || busy} onClick={() => void updateState(method, row.state === "active" ? "disabled" : "active")}>{busy ? "Güncelleniyor…" : row.state === "active" ? "Devre dışı bırak" : "Etkinleştir"}</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className={styles.methodCards}>{view.methods.map((row) => {
            const method = sources.methods.value.find(({ id }) => id === row.id)!;
            const busy = busyMethodId === row.id;
            return <article key={row.id} data-highlighted={highlightedMethodId === row.id ? "true" : undefined}><header><strong>{row.label}</strong><span className={styles[`tone-${row.stateTone}`]}>{row.stateLabel}</span></header><p>{row.providerLabel} · {row.modeLabel}</p><small>{row.environmentLabel} · {row.profileStatusLabel}</small><div><button type="button" className={styles.emergencyButton} disabled={!props.canManage || busy} onClick={() => void updateState(method, row.state === "emergency_disabled" ? "active" : "emergency_disabled")}><ShieldAlert />Acil Durum</button><button type="button" className={styles.secondaryButton} disabled={!props.canManage || busy} onClick={() => void updateState(method, row.state === "active" ? "disabled" : "active")}>{row.state === "active" ? "Devre dışı" : "Etkinleştir"}</button></div></article>;
          })}</div>
        </> : null}
      </section>

      {catalogOpen ? <PaymentProviderCatalogDialog cards={view.catalog.cards} totalCount={view.catalog.totalCount} query={query} filters={filters} phase={sources.catalog.phase} canManage={props.canManage} busy={selectedCard !== null} openerRef={addButtonRef} onQuery={setQuery} onFilters={(value) => setFilters(Object.freeze(value))} onClose={() => setCatalogOpen(false)} onConnect={(card) => { if (card.connectable && card.executableDescriptor) setSelectedCard(card); }} /> : null}
      {selectedCard?.executableDescriptor ? <PaymentProviderConnectionDrawer descriptor={selectedCard.executableDescriptor} profile={selectedProfile} canManage={props.canManage} onClose={() => setSelectedCard(null)} onSaved={load} /> : null}
      {orderOpen ? <PaymentMethodOrderDialog methods={sources.methods.value} rows={view.methods} canManage={props.canManage} openerRef={orderButtonRef} onReload={load} onClose={() => setOrderOpen(false)} /> : null}
    </section>
  );
}
