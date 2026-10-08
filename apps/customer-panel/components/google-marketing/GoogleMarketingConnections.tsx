"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { GoogleMarketingConnection, GoogleMarketingOverview, GoogleMarketingResources, GoogleMarketingSelection, GoogleMarketingService } from "@celebix/saas-contracts";
import { OrderActionDialog } from "@/components/orders/OrderActionDialog";
import { PanelSkeletonBlock, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { googleMarketingClient, type GoogleMarketingClient } from "./client";
import { SERVICES, createSelection, draftKey, emptyConnection, errorCode, errorMessage, readDraft, statusLabel, storeDraft, type Draft } from "./model";
import { GoogleConnectionArtwork } from "./GoogleConnectionArtwork";
import styles from "./google-marketing.module.css";

type Editor = {
  service: GoogleMarketingService;
  connection: GoogleMarketingConnection;
  draft: Draft;
  accountId: string;
  resources: GoogleMarketingResources;
  loading: boolean;
  error: string;
};
const EMPTY_RESOURCES: GoogleMarketingResources = { accounts: [], resources: [] };
const CONFLICTS = new Set(["version_conflict", "live_version_conflict", "operation_mismatch"]);
const DEFINITIVE_FAILURES = new Set(["invalid_input", "resource_denied", "wrong_domain", "unsafe_container", "membership_denied", "durable_authority_invalid", "store_inactive", "oauth_unconfigured", "crypto_unavailable", "ads_project_unapproved"]);
const PURPOSES = {
  gtm: "Google etiketlerini tek yerden yönetin.",
  ads: "Tamamlanan siparişleri dönüşüm olarak ölçün.",
  search_console: "Mağazanızı doğrulayın, site haritasını gönderin.",
};
function readFailureMessage(code: string, fallback: string) {
  return ["unavailable", "provider_unavailable", "provider_timeout", "commit_unknown"].includes(code) ? fallback : errorMessage(code);
}
function SelectionSummary({ selection, detailed = false }: { selection: GoogleMarketingSelection | null; detailed?: boolean }) {
  return selection ? <div className={styles.selectionSummary}><strong>{selection.resourceName}</strong>{detailed ? <span>{selection.tagId ?? selection.resourceId}</span> : null}</div> : null;
}

export function GoogleMarketingConnections({ canManage, onAuthorize, client = googleMarketingClient }: Readonly<{ canManage: boolean; onAuthorize?: (url: string) => void; client?: GoogleMarketingClient }>) {
  const [overview, setOverview] = useState<GoogleMarketingOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState<"connect" | "apply" | "disconnect" | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const alive = useRef(true);
  const discovery = useRef(0);
  const drafts = useRef(new Map<string, Draft>());
  const connectAttempts = useRef(new Map<GoogleMarketingService, string>());
  const overviewRef = useRef<GoogleMarketingOverview | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const busyRef = useRef(false);
  overviewRef.current = overview;
  editorRef.current = editor;

  function saveDraft(service: GoogleMarketingService, connection: GoogleMarketingConnection, draft: Draft) {
    const domain = overviewRef.current?.storeDomain ?? "";
    const key = draftKey(domain, connection.googleEmail, service);
    drafts.current.set(key, draft);
    storeDraft(key, draft);
  }
  function close() {
    if (busyRef.current) return;
    discovery.current++;
    setEditor(null);
    setConfirmRemove(false);
  }
  async function discover(current: Editor, accountId?: string) {
    const ticket = ++discovery.current;
    setEditor(value => value?.service === current.service ? { ...value, loading: true, error: "" } : value);
    try {
      let data = await client.resources(current.service, accountId);
      let selectedAccount = accountId ?? current.accountId;
      if (!accountId) {
        if (!data.accounts.some(account => account.id === selectedAccount)) selectedAccount = data.accounts.length === 1 ? data.accounts[0].id : "";
        if (selectedAccount) {
          const details = await client.resources(current.service, selectedAccount);
          data = { ...details, accounts: details.accounts.length ? details.accounts : data.accounts };
        }
      }
      if (current.service === "search_console") {
        const domain = overviewRef.current?.storeDomain ?? "";
        data = { ...data, resources: data.resources.filter(resource => resource.id === `https://${domain}/` || resource.id === `sc-domain:${domain}`) };
      }
      if (!alive.current || ticket !== discovery.current) return;
      setEditor(value => {
        if (!value || value.service !== current.service) return value;
        const sameAccount = !value.draft.selection || value.draft.selection.accountId === selectedAccount;
        const draft = sameAccount || value.draft.apply || value.draft.disconnect ? value.draft : { selection: null };
        return { ...value, accountId: selectedAccount, resources: { ...data, accounts: data.accounts.length ? data.accounts : value.resources.accounts }, draft, loading: false };
      });
    } catch (error) {
      if (alive.current && ticket === discovery.current) setEditor(value => value?.service === current.service ? { ...value, loading: false, error: errorCode(error) } : value);
    }
  }
  function openService(service: GoogleMarketingService, value = overviewRef.current) {
    if (!value?.oauthConfigured || !canManage || busyRef.current) return;
    setNotice("");
    setConfirmRemove(false);
    const connection = value.connections.find(item => item.service === service) ?? emptyConnection(service);
    const key = draftKey(value.storeDomain, connection.googleEmail, service);
    const saved = drafts.current.get(key) ?? readDraft(key);
    const validDraft = saved && (!saved.apply || saved.apply.input.service === service) && (!saved.disconnect || saved.disconnect.input.service === service) ? saved : null;
    const draft = validDraft ?? { selection: connection.selection };
    const current: Editor = { service, connection, draft, accountId: draft.selection?.accountId ?? "", resources: EMPTY_RESOURCES, loading: false, error: validDraft?.apply || validDraft?.disconnect ? "commit_unknown" : "" };
    setEditor(current);
    if (connection.googleEmail && connection.status !== "needs_reconnect") void discover(current);
  }
  async function loadOverview(recover = false) {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const value = await client.overview();
      if (!alive.current) return;
      overviewRef.current = value;
      setOverview(value);
      if (recover && editorRef.current) {
        const current = editorRef.current;
        const connection = value.connections.find(item => item.service === current.service) ?? emptyConnection(current.service);
        const draft: Draft = { selection: current.draft.selection };
        saveDraft(current.service, connection, draft);
        const refreshed = { ...current, connection, draft, error: "" };
        setEditor(refreshed);
        if (connection.googleEmail) void discover(refreshed);
      } else if (canManage) {
        try {
          const key = `celebix-google:resume:${value.storeDomain}`;
          const resume = window.sessionStorage.getItem(key);
          window.sessionStorage.removeItem(key);
          if (SERVICES.some(item => item.service === resume)) openService(resume as GoogleMarketingService, value);
        } catch { /* Optional local recovery is unavailable. */ }
      }
    } catch (error) { if (alive.current) setOverviewError(errorCode(error)); }
    finally { if (alive.current) setOverviewLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    void loadOverview();
    return () => { alive.current = false; discovery.current++; };
    // The screen performs one initial read; resources are discovered only on user setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseAccount(accountId: string) {
    if (!editor || busyRef.current || editor.draft.apply || editor.draft.disconnect) return;
    const draft = { selection: null };
    saveDraft(editor.service, editor.connection, draft);
    const next = { ...editor, accountId, draft, resources: { accounts: editor.resources.accounts, resources: [] }, error: "" };
    setEditor(next);
    if (accountId) void discover(next, accountId);
    else discovery.current++;
  }
  function chooseResource(resourceId: string) {
    if (!editor || busyRef.current || editor.draft.apply || editor.draft.disconnect) return;
    const option = editor.resources.resources.find(item => item.id === resourceId);
    const selection = resourceId === "__create__" ? createSelection(editor.service, editor.accountId, overview?.storeDomain ?? "") : option ? {
      accountId: editor.accountId, resourceId: option.id, resourceName: option.name,
      ...(option.tagId ? { tagId: option.tagId } : {}), ...(option.conversionLabel ? { conversionLabel: option.conversionLabel } : {}),
    } : null;
    const draft = { selection };
    saveDraft(editor.service, editor.connection, draft);
    setEditor({ ...editor, draft, error: "" });
  }
  async function connect() {
    const current = editorRef.current;
    if (!current || busyRef.current || !overviewRef.current?.oauthConfigured || !canManage) return;
    busyRef.current = true; setBusy("connect");
    const operationId = connectAttempts.current.get(current.service) ?? crypto.randomUUID();
    connectAttempts.current.set(current.service, operationId);
    try {
      saveDraft(current.service, current.connection, current.draft);
      const result = await client.connect(current.service, operationId);
      if (!alive.current) return;
      try { window.sessionStorage.setItem(`celebix-google:resume:${overviewRef.current?.storeDomain ?? ""}`, current.service); } catch { /* Navigation remains available without local recovery. */ }
      if (onAuthorize) onAuthorize(result.authorizationUrl); else window.location.assign(result.authorizationUrl);
    } catch (error) { if (alive.current) setEditor(value => value ? { ...value, error: errorCode(error) } : value); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function mutate(kind: "apply" | "disconnect") {
    const current = editorRef.current;
    if (!current || busyRef.current || !canManage || !overviewRef.current?.oauthConfigured || (kind === "apply" && (!current.draft.selection || current.draft.disconnect)) || (kind === "disconnect" && current.draft.apply)) return;
    busyRef.current = true; setBusy(kind);
    const attempt = kind === "apply" ? current.draft.apply ?? { operationId: crypto.randomUUID(), input: { service: current.service, expectedVersion: current.connection.version, selection: current.draft.selection! } } : current.draft.disconnect ?? { operationId: crypto.randomUUID(), input: { service: current.service, expectedVersion: current.connection.version } };
    const draft: Draft = kind === "apply" ? { ...current.draft, apply: attempt as NonNullable<Draft["apply"]> } : { ...current.draft, disconnect: attempt as NonNullable<Draft["disconnect"]> };
    saveDraft(current.service, current.connection, draft);
    setEditor({ ...current, draft, error: "" });
    try {
      const result = kind === "apply" ? await client.apply((attempt as NonNullable<Draft["apply"]>).input, attempt.operationId) : await client.disconnect(attempt.input, attempt.operationId);
      if (!alive.current) return;
      if (result.service !== current.service) throw new Error("unexpected_service");
      setOverview(value => value ? { ...value, connections: [...value.connections.filter(item => item.service !== result.service), result] } : value);
      const key = draftKey(overviewRef.current?.storeDomain ?? "", current.connection.googleEmail, current.service);
      drafts.current.delete(key); storeDraft(key, null);
      discovery.current++; setEditor(null);
      setNotice(kind === "apply" ? "Bağlantı uygulandı." : "Bağlantı kaldırıldı.");
    } catch (error) {
      if (alive.current) {
        const code = errorCode(error);
        const preserved: Draft = DEFINITIVE_FAILURES.has(code) ? { selection: current.draft.selection } : draft;
        saveDraft(current.service, current.connection, preserved);
        setConfirmRemove(false);
        setEditor(value => value ? { ...value, draft: preserved, error: code } : value);
      }
    } finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }

  const definition = SERVICES.find(item => item.service === editor?.service);
  const accountLabel = editor?.service === "gtm" ? "Tag Manager hesabı" : "Google hesabı";
  const reconnect = editor && (!editor.connection.googleEmail || editor.connection.status === "needs_reconnect" || ["needs_reconnect", "incremental_authorization_required", "oauth_denied", "oauth_state_invalid"].includes(editor.error));
  const conflict = editor && CONFLICTS.has(editor.error);
  const selection = editor?.draft.selection;
  const knownSelection = selection?.create || editor?.resources.resources.some(item => item.id === selection?.resourceId && (!item.parentId || item.parentId === editor.accountId));
  const canApply = Boolean(editor && !editor.loading && !busy && !reconnect && !conflict && !editor.draft.disconnect && selection && (knownSelection || editor.draft.apply));
  const locked = Boolean(busy || editor?.draft.apply || editor?.draft.disconnect);
  const connectLabel = busy === "connect" ? "Google’a yönlendiriliyor…" : editor?.error === "incremental_authorization_required" ? "Google’da yetkiyi tamamla" : editor?.connection.googleEmail ? "Google’a yeniden bağlan" : "Google ile bağlan";
  return <div className={styles.workspace}>
    {overview?.storeDomain ? <p className={styles.domain}><span>Mağaza</span><strong>{overview.storeDomain}</strong></p> : null}
    {notice ? <p role="status" className={styles.notice}><Check size={16} aria-hidden="true" />{notice}</p> : null}
    {overviewError ? <div className={styles.feedback}><p role="alert">{readFailureMessage(overviewError, "Bağlantılar yüklenemedi. Tekrar deneyin.")}</p><button type="button" className="button button-secondary" disabled={overviewLoading} onClick={() => void loadOverview()}>Tekrar dene</button></div> : null}
    {overview && !overview.oauthConfigured ? <p className={styles.feedback} role="status">{errorMessage("oauth_unconfigured")}</p> : null}
    {!canManage ? <p className={styles.help}>Bağlantıları değiştirmek için entegrasyon yönetimi yetkisi gerekir.</p> : null}
    <div className={styles.services} aria-busy={overviewLoading || undefined}>
      {SERVICES.map(item => {
        const connection = overview?.connections.find(value => value.service === item.service) ?? emptyConnection(item.service);
        return <article className={styles.serviceRow} key={item.service}>
          <GoogleConnectionArtwork service={item.service} />
          <div className={styles.serviceContent}>
            <div className={styles.serviceHeading}><h2>{item.name}</h2>{!overviewLoading || overview ? <PanelStatusBadge tone={connection.status === "connected" ? "success" : connection.status === "needs_reconnect" || connection.status === "error" ? "warning" : "neutral"}>{statusLabel(connection)}</PanelStatusBadge> : null}</div>
            <p className={styles.description}>{PURPOSES[item.service]}</p>
            {overviewLoading && !overview ? <div className={styles.skeleton} aria-label="Bağlantı yükleniyor" role="status"><PanelSkeletonBlock /><PanelSkeletonBlock /></div> : <>
              <SelectionSummary selection={connection.selection} />
              {connection.googleEmail ? <p className={styles.email}>{connection.googleEmail}</p> : null}
              {connection.errorCode ? <p className={styles.cardError}>{errorMessage(connection.errorCode)}</p> : null}
              {connection.selection ? <details className={styles.details}><summary>Ayrıntılar</summary><SelectionSummary selection={connection.selection} detailed /></details> : null}
            </>}
          </div>
          {canManage ? <button type="button" data-service={item.service} className={`button button-secondary ${styles.manage}`} disabled={!overview?.oauthConfigured || overviewLoading || Boolean(busy)} aria-label={`${item.name} bağlantısını yönet`} aria-haspopup="dialog" onClick={() => openService(item.service)}>{connection.status === "connected" ? "Yönet" : connection.googleEmail ? "Kurulumu tamamla" : "Bağlan"}<ArrowUpRight size={16} aria-hidden="true" /></button> : null}
        </article>;
      })}
    </div>
    <OrderActionDialog open={Boolean(editor)} title={definition?.name ?? "Google bağlantısı"} className={styles.dialog} busy={Boolean(busy)} onClose={close} footer={editor ? <div className={styles.actions}>
      {confirmRemove ? <>
        <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => setConfirmRemove(false)}>Vazgeç</button>
        <button type="button" className={`button button-primary ${styles.removeConfirm}`} disabled={Boolean(busy)} onClick={() => void mutate("disconnect")}>{busy === "disconnect" ? "Kaldırılıyor…" : "Evet, bağlantıyı kaldır"}</button>
      </> : <>
        {editor.connection.googleEmail ? <button className={`button button-text ${styles.disconnect}`} type="button" disabled={Boolean(busy) || Boolean(editor.draft.apply)} onClick={() => editor.draft.disconnect ? void mutate("disconnect") : setConfirmRemove(true)}>{busy === "disconnect" ? "Kaldırılıyor…" : editor.draft.disconnect ? "Kaldırmayı tekrar dene" : "Bağlantıyı kaldır"}</button> : null}
        <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={close}>Vazgeç</button>
        {reconnect ? <button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void connect()}>{connectLabel}</button> : <button type="button" className="button button-primary" disabled={!canApply} onClick={() => void mutate("apply")}>{busy === "apply" ? "Uygulanıyor…" : editor.draft.apply ? "Tekrar uygula" : "Uygula"}</button>}
      </>}
    </div> : null}>
      {editor ? <div className={styles.form}>
        <ol className={styles.steps} aria-label="Bağlantı adımları">
          <li aria-current={reconnect ? "step" : undefined}><span className={styles.stepNumber}>{reconnect ? "1" : <Check size={14} aria-hidden="true" />}</span>Google hesabı</li>
          <li aria-hidden="true" className={styles.stepArrow}><ChevronRight size={16} /></li>
          <li aria-current={!reconnect ? "step" : undefined}><span className={styles.stepNumber}>2</span>Mağazaya bağla</li>
        </ol>
        {editor.error ? <p role="alert" className={styles.feedback}>{!editor.draft.apply && !editor.draft.disconnect && !reconnect ? readFailureMessage(editor.error, "Google kaynakları yüklenemedi. Listeyi yenileyin.") : errorMessage(editor.error)}</p> : null}
        {conflict ? <button type="button" className="button button-secondary" disabled={Boolean(busy) || overviewLoading} onClick={() => void loadOverview(true)}>Güncel bağlantıyı yükle</button> : null}
        {confirmRemove ? <section className={styles.removePrompt} aria-label="Bağlantıyı kaldırma onayı"><h3>Bağlantı kaldırılsın mı?</h3><p>Celebix bağlantısı durur. Google hesabınız ve Google’daki kaynaklarınız silinmez.</p></section> : <>
          {reconnect ? <div className={styles.connectPrompt}>
            <GoogleConnectionArtwork service={editor.service} />
            <div><h3>Google hesabınızı bağlayın</h3><p>{editor.connection.googleEmail ? "Erişimi tamamlayın; seçiminiz korunur." : "Google’da hesabınızı seçin. Dönüşte buradan devam edin."}</p></div>
          </div> : <>
            <div className={styles.scope}><span>Google hesabı</span><strong>{editor.connection.googleEmail}</strong></div>
            <section className={styles.choiceGroup} aria-label="Hesap ve kaynak seçimi">
              {editor.service !== "search_console" ? <label className={styles.field}>{accountLabel}<select aria-label={accountLabel} value={editor.accountId} disabled={locked || editor.loading} onChange={event => chooseAccount(event.target.value)}><option value="">Hesap seçin</option>{editor.resources.accounts.map(account => <option value={account.id} key={account.id}>{account.name}{editor.resources.accounts.some(other => other.id !== account.id && other.name === account.name) ? ` · ${account.id}` : ""}</option>)}</select></label> : null}
              {editor.loading ? <div role="status" className={styles.loading}><PanelSkeletonBlock /><span>Google kaynakları yükleniyor…</span></div> : null}
              {!editor.loading && !editor.error && editor.resources.accounts.length === 0 ? <p className={styles.help}>Bu Google hesabında erişebildiğiniz bir kaynak bulunamadı. Hesap izinlerinizi kontrol edin.</p> : null}
              {editor.accountId ? <>
                <label className={styles.field}>{definition?.resourceLabel}<select aria-label={definition?.resourceLabel} value={selection?.create ? "__create__" : selection?.resourceId ?? ""} disabled={locked || editor.loading} onChange={event => chooseResource(event.target.value)}><option value="">{definition?.resourceLabel} seçin</option>{editor.resources.resources.map(resource => <option value={resource.id} key={resource.id}>{resource.name}{editor.resources.resources.some(other => other.id !== resource.id && other.name === resource.name) ? ` · ${resource.tagId ?? resource.id}` : ""}</option>)}{editor.service !== "ads" && overview?.storeDomain ? <option value="__create__">{editor.service === "gtm" ? "Yeni mağaza konteyneri oluştur" : "Mağazanın sitesini doğrula"}</option> : null}</select></label>
                {editor.service !== "ads" && overview?.storeDomain && !selection?.create ? <button className={`button button-text ${styles.createResource}`} type="button" disabled={locked || editor.loading} onClick={() => chooseResource("__create__")}>{editor.service === "gtm" ? "Mağazam için yeni konteyner oluştur" : "Bu mağazanın sitesini doğrula"}<ChevronRight size={16} aria-hidden="true" /></button> : null}
                {editor.service === "ads" && !editor.loading && editor.resources.resources.length === 0 && !editor.error ? <div className={styles.empty}><p>Bu hesapta satın alma dönüşümü bulunamadı.</p><a className={styles.link} href="https://ads.google.com/aw/conversions" target="_blank" rel="noopener noreferrer">Google Ads’te satın alma dönüşümü oluştur<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (yeni sekme)</span></a><p className={styles.help}>Web sitesi için manuel dönüşüm oluşturun, sonra listeyi yenileyin.</p></div> : null}
                {selection ? <div className={styles.applySummary}><ShieldCheck size={20} aria-hidden="true" /><div><SelectionSummary selection={selection} /><p>{editor.service === "gtm" ? "Standart etiketler kurulup yayımlanır. Mevcut etiketler korunur." : editor.service === "ads" ? "Ödemesi tamamlanan web siparişleri ölçülür. Bağlı Tag Manager’ın etiketleri de güncellenip yayımlanır." : "Mağazanız doğrulanır ve site haritası Google’a gönderilir."}</p></div></div> : null}
              </> : null}
            </section>
            <div className={styles.resourceActions}><button className="button button-text" type="button" disabled={Boolean(busy) || editor.loading || locked} onClick={() => void discover(editor, editor.accountId || undefined)}><RefreshCw size={16} aria-hidden="true" />Listeyi yenile</button><button className="button button-text" type="button" disabled={Boolean(busy) || Boolean(editor.draft.disconnect)} onClick={() => void connect()}>Google hesabını değiştir</button></div>
          </>}
          {editor.service === "gtm" ? <div className={styles.externalHelp}><a className={styles.link} href="https://tagmanager.google.com/" target="_blank" rel="noopener noreferrer">Yeni Tag Manager hesabı oluştur<ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only"> (yeni sekme)</span></a>{reconnect || editor.resources.accounts.length === 0 ? <p className={styles.help}>{reconnect ? "Hesabınız yoksa Google’da oluşturun, sonra buradan bağlanın." : "Aynı Google hesabıyla oluşturun, sonra listeyi yenileyin."}</p> : null}</div> : null}
        </>}
        <div className={styles.metaLinks}><details className={styles.details}><summary>Ayrıntılar</summary><div className={styles.scope}><span>Mağaza</span><strong>{overview?.storeDomain || "Alan adı bulunamadı"}</strong>{editor.connection.googleEmail ? <><span>Google hesabı</span><strong>{editor.connection.googleEmail}</strong></> : null}{selection?.accountId && editor.service !== "search_console" ? <><span>Hesap kimliği</span><strong>{selection.accountId}</strong></> : null}</div><SelectionSummary selection={selection ?? null} detailed /></details>
        <a className={styles.privacy} href="https://celebix.net/tr/gizlilik" target="_blank" rel="noopener noreferrer">Gizlilik politikası<span className="sr-only"> (yeni sekme)</span></a></div>
      </div> : null}
    </OrderActionDialog>
  </div>;
}
