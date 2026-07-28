"use client";

import type {
  BuiltInPaymentMethodKind,
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
  PaymentMethodState,
} from "@celebix/saas-contracts";
import Image from "next/image";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  GripVertical,
  Plus,
  RefreshCw,
  ShieldAlert,
  Truck,
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
import { saveBuiltInPaymentMethod } from "@/lib/built-in-payment-methods/controller";
import {
  PaymentMethodApiError,
  paymentMethodApi,
} from "@/lib/payment-method-ui/client";
import {
  activateProviderPaymentMethod,
  createLoadingPaymentSettingsSources,
  loadPaymentSettingsSources,
  type PaymentSettingsSources,
} from "@/lib/payment-settings-ui/console-state";
import {
  buildPaymentSettingsViewModel,
  selectPaymentProviderConnectionProfile,
  type PaymentProviderCatalogCard,
  type PaymentSettingsFilters,
} from "@/lib/payment-settings-ui/model";
import { providerExecutionApi } from "@/lib/provider-execution-ui/client";
import {
  IyzicoActivationApiError,
  iyzicoActivationApi,
} from "@/lib/iyzico-activation-ui/client";

import {
  BuiltInPaymentMethodDrawer,
  type BuiltInPaymentMethodDrawerSubmit,
} from "./BuiltInPaymentMethodDrawer";
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
type MessageTone = "success" | "warning" | "error";
type BuiltInSelection = Readonly<{
  kind: BuiltInPaymentMethodKind;
  method: MerchantPaymentMethod | null;
}>;
type LoadOutcome = Readonly<{
  applied: boolean;
  sources: Sources;
}>;

const BUILT_IN_RELOAD_ERROR = "Güncel ödeme yöntemleri yüklenemedi. Pencereyi kapatıp yeniden yüklemeyi deneyin.";
const BUILT_IN_DUPLICATE_ERROR = "Yerleşik ödeme yöntemi kayıtları doğrulanamadı. Pencereyi kapatıp yeniden yüklemeyi deneyin.";

function PaymentConsoleActions(props: Readonly<{
  canManage: boolean;
  loading: boolean;
  orderAvailable: boolean;
  addRef?: RefObject<HTMLButtonElement | null>;
  orderRef?: RefObject<HTMLButtonElement | null>;
  onOrder(): void;
  onAdd(): void;
}>) {
  return <div className={styles.commandBar} aria-label="Ödeme ayarları işlemleri">
    <button ref={props.orderRef} className={styles.secondaryButton} type="button" disabled={!props.canManage || props.loading || !props.orderAvailable} onClick={props.onOrder}><GripVertical aria-hidden="true" />Önizleme ve Sıralama</button>
    <button ref={props.addRef} className={styles.primaryButton} type="button" disabled={!props.canManage || props.loading} onClick={props.onAdd}><Plus aria-hidden="true" />Ödeme Yöntemi Ekle</button>
  </div>;
}

function safeMessage(error: unknown): string {
  return error instanceof PaymentMethodApiError ? error.message : "Ödeme yöntemi güncellenemedi.";
}

export function PaymentSettingsConsole(props: Readonly<{
  canManage: boolean;
  storefrontHostname: string | null;
  initialDialog?: "provider-catalog" | null;
  initialMethodId?: string | null;
}>) {
  const [sources, setSources] = useState<Sources>(() => createLoadingPaymentSettingsSources());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PaymentSettingsFilters>(FILTERS);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<PaymentProviderCatalogCard | null>(null);
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<BuiltInSelection | null>(null);
  const [busyBuiltInKind, setBusyBuiltInKind] = useState<BuiltInPaymentMethodKind | null>(null);
  const [builtInSubmitError, setBuiltInSubmitError] = useState<string | null>(null);
  const [methodsMutationAvailable, setMethodsMutationAvailable] = useState(false);
  const [methodsLoadError, setMethodsLoadError] = useState(false);
  const [busyMethodId, setBusyMethodId] = useState<string | null>(null);
  const [busyProviderCode, setBusyProviderCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("error");
  const [highlightedMethodId, setHighlightedMethodId] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadVersion = useRef(0);
  const lastReadyMethods = useRef<readonly MerchantPaymentMethod[] | null>(null);
  const builtInOpenerRef = useRef<HTMLButtonElement | null>(null);
  const initialSurfaceHandled = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const orderButtonRef = useRef<HTMLButtonElement>(null);
  const methodRefs = useRef(new Map<string, HTMLTableRowElement>());

  const load = useCallback(async (): Promise<LoadOutcome> => {
    const version = loadVersion.current + 1;
    loadVersion.current = version;
    setMethodsMutationAvailable(false);
    setSources(() => {
      const loading = createLoadingPaymentSettingsSources<
        PaymentProviderCatalogEntry,
        MerchantProviderDescriptor,
        MerchantProviderProfile,
        MerchantPaymentMethod
      >();
      return lastReadyMethods.current === null ? loading : Object.freeze({
        ...loading,
        methods: Object.freeze({ phase: "ready" as const, value: lastReadyMethods.current }),
      });
    });
    const result = await loadPaymentSettingsSources({
      catalog: () => paymentMethodApi.catalog(),
      definitions: () => providerExecutionApi.definitions("payment_processing"),
      profiles: () => providerExecutionApi.profiles("payment_processing"),
      methods: () => paymentMethodApi.list(),
      shouldLoadProviderExecution: (catalog) => catalog.some(({ readiness }) =>
        readiness === "production_ready" || readiness === "sandbox_ready" || readiness === "verification"),
    });
    const applied = mounted.current && loadVersion.current === version;
    if (applied) {
      const methodsReady = result.methods.phase === "ready";
      if (methodsReady) lastReadyMethods.current = result.methods.value;
      setMethodsMutationAvailable(methodsReady);
      setMethodsLoadError(!methodsReady);
      setSources(!methodsReady && lastReadyMethods.current !== null ? Object.freeze({
        ...result,
        methods: Object.freeze({ phase: "ready" as const, value: lastReadyMethods.current }),
      }) : result);
    }
    return Object.freeze({ applied, sources: result });
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
    sources.methods.phase === "ready",
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

  function canonicalMethods(outcome: LoadOutcome): readonly MerchantPaymentMethod[] | null {
    return outcome.applied && outcome.sources.methods.phase === "ready"
      ? outcome.sources.methods.value
      : null;
  }

  function activeButton(): HTMLButtonElement | null {
    const active = document.activeElement as Partial<HTMLButtonElement> | null;
    return active?.tagName === "BUTTON" && typeof active.focus === "function"
      ? active as HTMLButtonElement
      : null;
  }

  function restoreBuiltInFocus() {
    const opener = builtInOpenerRef.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else addButtonRef.current?.focus();
    });
  }

  function closeBuiltIn() {
    if (busyBuiltInKind !== null) return;
    setSelectedBuiltIn(null);
    setBuiltInSubmitError(null);
    restoreBuiltInFocus();
  }

  async function updateState(method: MerchantPaymentMethod, state: PaymentMethodState) {
    if (!props.canManage || !methodsMutationAvailable || busyMethodId) return;
    if (method.providerCode === "iyzico_iframe" && state === "active") {
      setBusyMethodId(method.id);
      setMessage("");
      try {
        const result = await advanceIyzicoActivation();
        const reloaded = await load();
        if (canonicalMethods(reloaded) === null) {
          setMessageTone("error");
          setMessage("Güncel ödeme yöntemleri yüklenemedi. Yeniden yüklemeyi deneyin.");
        } else {
          setMessageTone(result.tone);
          setMessage(result.message);
        }
      } catch (error) {
        setMessageTone("error");
        setMessage(error instanceof IyzicoActivationApiError
          ? error.message
          : "Iyzico aktivasyonu tamamlanamadı.");
      } finally { setBusyMethodId(null); }
      return;
    }
    let emergencyReason: string | null = null;
    if (state === "emergency_disabled") {
      const reason = window.prompt("Acil kapatma nedenini yazın (3-240 karakter):")?.trim() ?? "";
      if (reason.length < 3 || reason.length > 240) { setMessageTone("error"); setMessage("Acil kapatma nedeni 3-240 karakter olmalıdır."); return; }
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
      const reloaded = await load();
      if (canonicalMethods(reloaded) === null) {
        setMessageTone("error");
        setMessage("Güncel ödeme yöntemleri yüklenemedi. Yeniden yüklemeyi deneyin.");
      } else {
        setMessageTone("success");
        setMessage("Ödeme yöntemi durumu güncellendi.");
      }
    } catch (error) {
      setMessageTone("error");
      setMessage(safeMessage(error));
      if (error instanceof PaymentMethodApiError && error.code === "version_conflict") await load();
    } finally { setBusyMethodId(null); }
  }

  async function advanceIyzicoActivation(): Promise<Readonly<{
    tone: "success" | "warning";
    message: string;
    active: boolean;
  }>> {
    const current = await iyzicoActivationApi.current();
    if (current.phase === "ready_to_activate"
      && current.methodId !== null && current.expectedMethodVersion !== null) {
      await iyzicoActivationApi.activate(current.methodId, current.expectedMethodVersion);
      return Object.freeze({ tone: "success", message: "Iyzico ödeme yöntemi etkinleştirildi.", active: true });
    }
    if (current.phase === "active") {
      return Object.freeze({ tone: "success", message: "Iyzico ödeme yöntemi zaten etkin.", active: true });
    }
    if (current.phase === "evidence_pending" || current.phase === "rejected") {
      await iyzicoActivationApi.begin();
      return Object.freeze({ tone: "warning", message: "Iyzico sandbox doğrulaması başlatıldı.", active: false });
    }
    if (current.phase === "running") {
      return Object.freeze({ tone: "warning", message: "Iyzico sandbox doğrulaması devam ediyor.", active: false });
    }
    if (current.phase === "credentials_unverified") {
      return Object.freeze({ tone: "warning", message: "Önce Iyzico test hesabı doğrulamasını tamamlayın.", active: false });
    }
    return Object.freeze({ tone: "warning", message: "Iyzico sandbox çalışma paketi henüz yayımlanmadı.", active: false });
  }

  async function connectProvider(card: PaymentProviderCatalogCard) {
    const providerConfigurationAvailable = sources.catalog.phase === "ready"
      && sources.definitions.phase === "ready"
      && sources.profiles.phase === "ready";
    const requiresMethodAuthority = card.actionLabel === "Etkinleştir";
    if (!props.canManage || !providerConfigurationAvailable || busyProviderCode || !card.configurable || !card.configurableDescriptor) return;
    if (requiresMethodAuthority && !methodsMutationAvailable) return;
    const descriptor = card.executableDescriptor;
    const profile = descriptor?.environments === undefined
      ? card.configurableDescriptor?.environments === undefined ? null : selectPaymentProviderConnectionProfile(
        sources.profiles.phase === "ready" ? sources.profiles.value : [],
        card.providerCode,
        card.configurableDescriptor.environments,
      )
      : selectPaymentProviderConnectionProfile(
        sources.profiles.phase === "ready" ? sources.profiles.value : [],
        card.providerCode,
        descriptor.environments,
      );
    if (card.providerCode === "iyzico_iframe" && profile?.status === "active" && requiresMethodAuthority) {
      setBusyProviderCode(card.providerCode);
      setMessage("");
      try {
        const result = await advanceIyzicoActivation();
        const reloaded = await load();
        if (canonicalMethods(reloaded) === null) {
          setMessageTone("error");
          setMessage("Güncel ödeme yöntemleri yüklenemedi. Yeniden yüklemeyi deneyin.");
        } else {
          setMessageTone(result.tone);
          setMessage(result.message);
          if (result.active) setCatalogOpen(false);
        }
      } catch (error) {
        setMessageTone("error");
        setMessage(error instanceof IyzicoActivationApiError
          ? error.message
          : "Iyzico aktivasyonu tamamlanamadı.");
      } finally { setBusyProviderCode(null); }
      return;
    }
    if (descriptor === null || profile?.status !== "active" || card.lifecycleLabel === "Aktif") {
      setSelectedCard(card);
      return;
    }

    setBusyProviderCode(card.providerCode);
    setMessage("");
    try {
      const result = await activateProviderPaymentMethod({
        card,
        profile,
        methods: sources.methods.phase === "ready" ? sources.methods.value : [],
        api: paymentMethodApi,
      });
      const reloaded = await load();
      if (canonicalMethods(reloaded) === null) {
        setMessageTone("error");
        setMessage("Güncel ödeme yöntemleri yüklenemedi. Yeniden yüklemeyi deneyin.");
      } else if (result.kind === "active") {
        setMessageTone("success");
        setMessage("Ödeme yöntemi etkinleştirildi.");
        setCatalogOpen(false);
      } else if (result.kind === "emergency_disabled") {
        setMessageTone("warning");
        setMessage("Ödeme yöntemi acil durumda kapalı; otomatik olarak etkinleştirilmedi.");
      } else {
        setMessageTone("warning");
        setMessage("Bağlı — aktivasyon bekliyor.");
      }
    } catch (error) {
      setMessageTone("error");
      setMessage(safeMessage(error));
      if (error instanceof PaymentMethodApiError && error.code === "version_conflict") await load();
    } finally {
      setBusyProviderCode(null);
    }
  }

  function openBuiltIn(kind: BuiltInPaymentMethodKind, opener = activeButton()) {
    if (!props.canManage || !methodsMutationAvailable || busyBuiltInKind !== null || sources.methods.phase !== "ready") return;
    const matches = sources.methods.value.filter((method) => method.kind === kind);
    if (matches.length > 1) {
      setMessageTone("error");
      setMessage(BUILT_IN_DUPLICATE_ERROR);
      return;
    }
    builtInOpenerRef.current = opener;
    setBuiltInSubmitError(null);
    setMessage("");
    setSelectedBuiltIn(Object.freeze({ kind, method: matches[0] ?? null }));
  }

  async function saveBuiltIn(value: BuiltInPaymentMethodDrawerSubmit) {
    if (!props.canManage || !methodsMutationAvailable || busyBuiltInKind !== null || value.kind !== selectedBuiltIn?.kind) return;
    setBusyBuiltInKind(value.kind);
    setBuiltInSubmitError(null);
    setMessage("");
    try {
      const result = await saveBuiltInPaymentMethod({
        ...value,
        api: paymentMethodApi,
      });
      const reloaded = await load();
      const methods = canonicalMethods(reloaded);
      if (methods === null) {
        setBuiltInSubmitError(BUILT_IN_RELOAD_ERROR);
        return;
      }
      const matches = methods.filter((method) => method.kind === value.kind);
      const duplicateCreate = selectedBuiltIn.method === null
        && value.method === null
        && result.kind === "conflict"
        && result.reason === "method_already_exists";
      const canonical = matches.length === 1
        && (matches[0]?.id === result.methodId || duplicateCreate)
        ? matches[0]
        : null;
      if (canonical === null) {
        setMethodsMutationAvailable(false);
        setBuiltInSubmitError(BUILT_IN_DUPLICATE_ERROR);
        return;
      }
      if (result.kind === "conflict" || result.kind === "ambiguous") {
        setSelectedBuiltIn(Object.freeze({ kind: value.kind, method: canonical }));
        setBuiltInSubmitError(`${result.message} Güncel bilgiler yeniden yüklendi; alanları kontrol edip tekrar deneyin.`);
        return;
      }
      if (result.kind === "active" || result.kind === "updated") {
        setMessageTone("success");
      } else if (result.kind === "emergency_disabled") {
        setMessageTone("warning");
      }
      setMessage(result.message);
      setSelectedBuiltIn(null);
      setBuiltInSubmitError(null);
      restoreBuiltInFocus();
    } catch (error) {
      setBuiltInSubmitError(`${safeMessage(error)} Alanları kontrol edip tekrar deneyin.`);
    } finally {
      setBusyBuiltInKind(null);
    }
  }

  const methodMutationBusy = busyMethodId !== null || busyBuiltInKind !== null || busyProviderCode !== null;

  function openOrder() {
    if (!props.canManage || !methodsMutationAvailable || methodMutationBusy) return;
    setOrderOpen(true);
  }

  const methodsLoading = sources.methods.phase === "loading";
  const providerConfigurationAvailable = sources.catalog.phase === "ready"
    && sources.definitions.phase === "ready"
    && sources.profiles.phase === "ready";
  const orderAvailable = methodsMutationAvailable && !methodMutationBusy;
  const topbarActions = <PaymentConsoleActions canManage={props.canManage} loading={methodsLoading} orderAvailable={orderAvailable} addRef={addButtonRef} orderRef={orderButtonRef} onOrder={openOrder} onAdd={() => setCatalogOpen(true)} />;
  const selectedProfiles = selectedCard?.configurableDescriptor
    ? (sources.profiles.phase === "ready" ? sources.profiles.value : []).filter((profile) =>
      profile.providerCode === selectedCard.providerCode
      && profile.capability === "payment_processing")
    : [];

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

      {message ? <p className={messageTone === "success" ? styles.successNotice : messageTone === "warning" ? styles.providerWarning : styles.errorNotice} role={messageTone === "error" ? "alert" : "status"}>{messageTone === "success" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}{message}</p> : null}
      {sources.catalog.phase === "error" || sources.profiles.phase === "error" || sources.definitions.phase === "error" ? <p className={styles.providerWarning} role="status"><ShieldAlert aria-hidden="true" />Sağlayıcı bağlantı bilgileri şu anda sınırlı; mevcut ödeme yöntemleri ayrı olarak çalışmaya devam eder.</p> : null}

      <section className={styles.methodsPanel} aria-labelledby="payment-methods-title">
        <header className={styles.methodsHeader}>
          <div><h2 id="payment-methods-title">Ödeme Yöntemleri</h2><p>Ödeme yöntemlerini ekleyebilir ve ödeme adımındaki sıralarını ayarlayabilirsiniz.</p></div>
          <PaymentConsoleActions canManage={props.canManage} loading={methodsLoading} orderAvailable={orderAvailable} onOrder={openOrder} onAdd={() => setCatalogOpen(true)} />
        </header>

        {sources.methods.phase === "loading" ? <p className={styles.loadingState} role="status">Ödeme yöntemleri yükleniyor…</p> : null}
        {methodsLoadError ? <div className={styles.loadError} role="alert"><span>Ödeme yöntemleri yüklenemedi.</span><button type="button" className={styles.secondaryButton} onClick={() => void load()}><RefreshCw />Tekrar dene</button></div> : null}
        {sources.methods.phase === "ready" && view.methods.length === 0 ? <div className={styles.emptyMethods}><CreditCard aria-hidden="true" /><h3>Henüz yöntem yok</h3><p>Hazır bir sağlayıcı etkinleştirildiğinde veya yerleşik yöntem eklendiğinde burada görünür.</p>{props.canManage ? <button type="button" className={styles.primaryButton} onClick={() => setCatalogOpen(true)}><Plus />Ödeme Yöntemi Ekle</button> : <span>Salt okunur erişim</span>}</div> : null}

        {sources.methods.phase === "ready" && view.methods.length > 0 ? <>
          <div className={styles.methodTableWrap}>
            <table className={styles.methodTable} aria-label="Ödeme yöntemleri">
              <thead><tr><th>Ödeme Yöntemleri</th><th>Acil Durum</th><th>Durum</th><th><span className={styles.srOnly}>İşlemler</span></th></tr></thead>
              <tbody>{view.methods.map((row) => {
                const method = sources.methods.value.find(({ id }) => id === row.id)!;
                const busy = busyMethodId === row.id;
                const builtInKind = row.kind === "provider" ? null : row.kind;
                const BuiltInIcon = row.kind === "bank_transfer"
                  ? Banknote
                  : row.kind === "cash_on_delivery" ? Truck : CreditCard;
                return <tr key={row.id} ref={(element) => { if (element) methodRefs.current.set(row.id, element); else methodRefs.current.delete(row.id); }} tabIndex={highlightedMethodId === row.id ? 0 : -1} data-highlighted={highlightedMethodId === row.id ? "true" : undefined}>
                  <td><div className={styles.methodIdentity}>{row.logoPath ? <span className={styles.methodLogo}><Image src={row.logoPath} alt="" width={41} height={30} /></span> : <span className={styles.methodLogo}><BuiltInIcon aria-hidden="true" /></span>}<span><strong>{row.label}</strong><small>{row.providerLabel} · {row.modeLabel} · {row.environmentLabel}</small></span></div></td>
                  <td><button type="button" className={row.state === "emergency_disabled" ? styles.emergencyActive : styles.emergencyButton} disabled={!props.canManage || !methodsMutationAvailable || busy || (builtInKind !== null && !row.builtInEditable)} onClick={() => void updateState(method, row.state === "emergency_disabled" ? "active" : "emergency_disabled")}><ShieldAlert />{row.state === "emergency_disabled" ? "Acil kapatmayı kaldır" : "Acil kapat"}</button></td>
                  <td><span className={styles[`tone-${row.stateTone}`]}>{row.stateLabel}</span><small className={styles.profileState}>{row.profileStatusLabel}</small></td>
                  <td><div className={styles.commandBar}>{builtInKind && row.builtInEditable ? <button type="button" className={styles.secondaryButton} disabled={!props.canManage || !methodsMutationAvailable || busy || busyBuiltInKind !== null} onClick={(event) => openBuiltIn(builtInKind, event.currentTarget)}>Düzenle</button> : null}<button type="button" className={styles.secondaryButton} disabled={!props.canManage || !methodsMutationAvailable || busy || (builtInKind !== null && !row.builtInEditable)} onClick={() => void updateState(method, row.state === "active" ? "disabled" : "active")}>{busy ? "Güncelleniyor…" : row.state === "active" ? "Devre dışı bırak" : "Etkinleştir"}</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className={styles.methodCards}>{view.methods.map((row) => {
            const method = sources.methods.value.find(({ id }) => id === row.id)!;
            const busy = busyMethodId === row.id;
            const builtInKind = row.kind === "provider" ? null : row.kind;
            return <article key={row.id} data-highlighted={highlightedMethodId === row.id ? "true" : undefined}><header><strong>{row.label}</strong><span className={styles[`tone-${row.stateTone}`]}>{row.stateLabel}</span></header><p>{row.providerLabel} · {row.modeLabel}</p><small>{row.environmentLabel} · {row.profileStatusLabel}</small><div><button type="button" className={styles.emergencyButton} disabled={!props.canManage || !methodsMutationAvailable || busy || (builtInKind !== null && !row.builtInEditable)} onClick={() => void updateState(method, row.state === "emergency_disabled" ? "active" : "emergency_disabled")}><ShieldAlert />Acil Durum</button>{builtInKind && row.builtInEditable ? <button type="button" className={styles.secondaryButton} disabled={!props.canManage || !methodsMutationAvailable || busy || busyBuiltInKind !== null} onClick={(event) => openBuiltIn(builtInKind, event.currentTarget)}>Düzenle</button> : null}<button type="button" className={styles.secondaryButton} disabled={!props.canManage || !methodsMutationAvailable || busy || (builtInKind !== null && !row.builtInEditable)} onClick={() => void updateState(method, row.state === "active" ? "disabled" : "active")}>{row.state === "active" ? "Devre dışı" : "Etkinleştir"}</button></div></article>;
          })}</div>
        </> : null}
      </section>

      {catalogOpen ? <PaymentProviderCatalogDialog cards={view.catalog.cards} builtInCards={view.builtInCards} totalCount={view.catalog.totalCount} query={query} filters={filters} phase={sources.catalog.phase} canManage={props.canManage} mutationAvailable={methodsMutationAvailable} providerConfigurationAvailable={providerConfigurationAvailable} busy={selectedCard !== null || busyProviderCode !== null} openerRef={addButtonRef} onQuery={setQuery} onFilters={(value) => setFilters(Object.freeze(value))} onClose={() => setCatalogOpen(false)} onConnect={(card) => { void connectProvider(card); }} onBuiltInSelect={(kind) => openBuiltIn(kind)} /> : null}
      {selectedCard?.configurableDescriptor && selectedCard.connectionEnvironment ? <PaymentProviderConnectionDrawer descriptor={selectedCard.configurableDescriptor} environments={selectedCard.environments} initialEnvironment={selectedCard.connectionEnvironment} storefrontHostname={props.storefrontHostname} profiles={selectedProfiles} canManage={props.canManage} onClose={() => setSelectedCard(null)} onSaved={async () => { await load(); }} /> : null}
      {selectedBuiltIn ? <BuiltInPaymentMethodDrawer kind={selectedBuiltIn.kind} method={selectedBuiltIn.method} canManage={props.canManage} busy={busyBuiltInKind !== null} mutationAvailable={methodsMutationAvailable} submitError={builtInSubmitError} onSubmit={saveBuiltIn} onClose={closeBuiltIn} /> : null}
      {orderOpen ? <PaymentMethodOrderDialog methods={sources.methods.value} rows={view.methods} canManage={props.canManage} mutationAvailable={methodsMutationAvailable} mutationBusy={methodMutationBusy} openerRef={orderButtonRef} onReload={async () => { await load(); }} onClose={() => setOrderOpen(false)} /> : null}
    </section>
  );
}
