"use client";

import type { AdminDomainView, StoreDomainDnsInstruction, StoreDomainView } from "@celebix/saas-contracts";
import { Check, Copy, ExternalLink, Globe2, RefreshCw, Star, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { adminDomainApi } from "@/lib/admin-domain-ui/client";
import { previewDomainBundle } from "@/lib/domain-bundle-ui/preview";
import { StoreDomainApiError, storeDomainApi } from "@/lib/store-domain-ui/client";
import { getStoreDomainProgress, getStoreDomainStatusPresentation } from "@/lib/store-domain-ui/presentation";
import styles from "./store-domain-settings.module.css";

const STEPS = Object.freeze(["Alan adı", "DNS", "SSL", "Yayında"] as const);

function Status({ domain }: Readonly<{ domain: StoreDomainView }>) {
  const status = getStoreDomainStatusPresentation(domain);
  return <span className={`${styles.status} ${styles[status.tone]}`}><i aria-hidden="true" />{status.label}</span>;
}

function Progress({ domain }: Readonly<{ domain: StoreDomainView }>) {
  const progress = getStoreDomainProgress(domain);
  return <ol className={styles.progress} aria-label="Mağaza alan adı bağlantı durumu">{STEPS.map((label, index) => <li key={label} className={index < progress ? styles.complete : ""}><span>{index < progress ? <Check size={12} strokeWidth={3} /> : index + 1}</span><small>{label}</small></li>)}</ol>;
}

function DnsRows({ instructions, copied, onCopy }: Readonly<{ instructions: readonly StoreDomainDnsInstruction[]; copied: string | null; onCopy(instruction: StoreDomainDnsInstruction): void }>) {
  return <div className={styles.dnsList} role="table" aria-label="DNS kayıtları">{instructions.map((instruction) => {
    const key = `${instruction.type}:${instruction.name}:${instruction.value}`;
    return <div className={styles.dnsRow} role="row" key={key}>
      <strong role="cell">{instruction.type}</strong>
      <span role="cell"><small>Ad</small><code title={instruction.name}>{instruction.name}</code></span>
      <span role="cell"><small>Değer</small><code title={instruction.value}>{instruction.value}</code></span>
      <button type="button" onClick={() => onCopy(instruction)} aria-label={`${instruction.name} DNS değerini kopyala`}>{copied === key ? <Check size={17} /> : <Copy size={17} />}</button>
    </div>;
  })}</div>;
}

function AdminState({ domain }: Readonly<{ domain: AdminDomainView | undefined }>) {
  if (!domain) return <span className={`${styles.status} ${styles.pending}`}><i aria-hidden="true" />Otomatik oluşturuluyor</span>;
  if (domain.uiStatus === "action_required") return <span className={`${styles.status} ${styles.danger}`}><i aria-hidden="true" />Kurulum tamamlanamadı</span>;
  if (domain.uiStatus !== "active") return <span className={`${styles.status} ${styles.pending}`}><i aria-hidden="true" />Kontrol ediliyor</span>;
  return <span className={`${styles.status} ${styles.success}`}><i aria-hidden="true" />Yayında</span>;
}

function AdminSummary({ domain }: Readonly<{ domain: AdminDomainView | undefined }>) {
  if (!domain) return <span>DNS bekleniyor · SSL hazırlanıyor · Kaynak bekleniyor</span>;
  return <span>{domain.dnsStatus === "ready" ? "DNS hazır" : "DNS bekleniyor"} · {domain.sslStatus === "active" ? "SSL aktif" : "SSL hazırlanıyor"} · {domain.originStatus === "ready" ? "Kaynak hazır" : "Kaynak bekleniyor"}</span>;
}

function BundleCard({ storefront, admin, canManage, busy, copied, onCopy, onStoreAction, onAdminRecheck }: Readonly<{
  storefront: StoreDomainView; admin: AdminDomainView | undefined; canManage: boolean; busy: boolean; copied: string | null;
  onCopy(instruction: StoreDomainDnsInstruction): void; onStoreAction(action: "recheck" | "primary" | "remove"): void; onAdminRecheck(): void;
}>) {
  const preview = previewDomainBundle(storefront.hostname);
  const adminHostname = admin?.hostname ?? preview?.admin ?? "Yönetim paneli hazırlanıyor";
  const active = storefront.uiStatus === "active" && admin?.uiStatus === "active";
  const dnsInstructions = [...storefront.dnsInstructions, ...(admin?.dnsInstructions ?? [])];
  return <article className={styles.bundle}>
    <header className={styles.bundleHeader}>
      <span className={styles.domainIcon} aria-hidden="true"><Globe2 size={20} /></span>
      <div><div className={styles.hostname}><strong>{storefront.hostname}</strong>{storefront.primary ? <span>Birincil mağaza</span> : null}</div><Status domain={storefront} /></div>
    </header>
    <div className={styles.endpoints}>
      <section aria-label="Mağaza adresi"><div><small>Mağaza</small><a href={`https://${storefront.hostname}`} target="_blank" rel="noreferrer">https://{storefront.hostname}<ExternalLink size={15} /></a></div><p>{storefront.uiStatus === "active" ? "DNS hazır · SSL aktif · Yayında" : "Bağlantı hazırlanıyor"}</p></section>
      <section aria-label="Yönetim paneli adresi"><div><small>Yönetim paneli <b>Otomatik oluşturuldu</b></small>{preview ? <a href={`https://${adminHostname}`} target="_blank" rel="noreferrer">https://{adminHostname}<ExternalLink size={15} /></a> : <strong>{adminHostname}</strong>}</div><AdminState domain={admin} /><p><AdminSummary domain={admin} /></p></section>
    </div>
    {!active ? <Progress domain={storefront} /> : <p className={styles.ready}><Check size={15} /> Mağaza ve yönetim paneli bağlantıları hazır.</p>}
    {dnsInstructions.length > 0 ? <details className={styles.dnsDetails} open={!active}><summary>DNS kayıtlarını göster</summary><DnsRows instructions={dnsInstructions} copied={copied} onCopy={onCopy} /></details> : null}
    {canManage ? <div className={styles.actions}>
      {storefront.uiStatus !== "active" ? <button type="button" disabled={busy} onClick={() => onStoreAction("recheck")}><RefreshCw size={16} />Durumu yenile</button> : null}
      {admin && admin.uiStatus !== "active" ? <button type="button" disabled={busy} onClick={onAdminRecheck}><RefreshCw size={16} />Yönetim panelini tekrar dene</button> : null}
      {storefront.status === "active" && !storefront.primary ? <button type="button" disabled={busy} onClick={() => onStoreAction("primary")}><Star size={16} />Birincil yap</button> : null}
      <button type="button" className={styles.remove} disabled={busy} onClick={() => onStoreAction("remove")}><Trash2 size={16} />Alan adını kaldır</button>
    </div> : null}
  </article>;
}

export function StoreDomainSettings({ canManage }: Readonly<{ canManage: boolean }>) {
  const [domains, setDomains] = useState<readonly StoreDomainView[]>([]);
  const [adminDomains, setAdminDomains] = useState<readonly AdminDomainView[]>([]);
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const mounted = useRef(true);
  const preview = useMemo(() => previewDomainBundle(hostname.trim()), [hostname]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [storefrontItems, adminItems] = await Promise.all([storeDomainApi.list(), adminDomainApi.list()]);
      if (mounted.current) { setDomains(storefrontItems.filter(({ status }) => status !== "disabled")); setAdminDomains(adminItems.filter(({ status }) => status !== "disabled")); setError(null); }
    } catch (caught) {
      if (mounted.current && !quiet) setError(caught instanceof StoreDomainApiError ? caught.message : "Alan adları yüklenemedi.");
    } finally { if (mounted.current && !quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 12_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [load]);

  const customDomains = domains.filter(({ hostnameType }) => hostnameType === "custom_domain");
  const platformDomains = domains.filter(({ hostnameType }) => hostnameType === "platform_subdomain");
  const platformAdminDomains = adminDomains.filter(({ fallback }) => fallback);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || busy || !preview) return;
    setBusy("create"); setError(null);
    try { await storeDomainApi.create(preview.storefront); if (mounted.current) { setHostname(""); await load(true); } }
    catch (caught) { if (mounted.current) setError(caught instanceof StoreDomainApiError ? caught.message : "Alan adı eklenemedi."); }
    finally { if (mounted.current) setBusy(null); }
  };

  const mutateStorefront = async (domain: StoreDomainView, action: "recheck" | "primary" | "remove") => {
    if (!canManage || busy) return;
    if (action === "remove" && !window.confirm("Bu mağaza alan adı ve ona bağlı otomatik yönetim paneli adresi devre dışı bırakılacaktır.\n\nTeknik Celebix yedek adresleriniz çalışmaya devam eder.")) return;
    setBusy(domain.id); setError(null);
    try {
      if (action === "recheck") await storeDomainApi.recheck(domain.id, domain.version);
      else if (action === "primary") await storeDomainApi.makePrimary(domain.id, domain.version);
      else await storeDomainApi.remove(domain.id, domain.version);
      if (mounted.current) await load(true);
    } catch (caught) { if (mounted.current) setError(caught instanceof StoreDomainApiError ? caught.message : "İşlem tamamlanamadı."); }
    finally { if (mounted.current) setBusy(null); }
  };

  const recheckAdmin = async (domain: AdminDomainView | undefined) => {
    if (!domain || !canManage || busy) return;
    setBusy(domain.id); setError(null);
    try { await adminDomainApi.recheck(domain.id, domain.version); if (mounted.current) await load(true); }
    catch (caught) { if (mounted.current) setError(caught instanceof StoreDomainApiError ? caught.message : "Yönetim paneli alan adı kontrol edilemedi."); }
    finally { if (mounted.current) setBusy(null); }
  };

  const copy = async (instruction: StoreDomainDnsInstruction) => {
    const key = `${instruction.type}:${instruction.name}:${instruction.value}`;
    try { await navigator.clipboard.writeText(instruction.value); setCopied(key); window.setTimeout(() => { if (mounted.current) setCopied(null); }, 1_800); }
    catch { setError("DNS değeri kopyalanamadı."); }
  };

  return <section className={styles.page} data-panel-layout="open-canvas">
    <PanelTopbarBridge title="Alan Adları" />
    <header className={styles.intro}><h1>Alan adları</h1><p>Mağazanız ve yönetim paneliniz için alan adı bağlantılarını tek yerden yönetin.</p></header>
    {canManage ? <form className={styles.add} onSubmit={create}>
      <div><label htmlFor="custom-domain">Mağaza alan adınızı bağlayın</label><p>Alan adını yazın; yönetim paneli adresiniz otomatik hazırlanır.</p></div>
      <div className={styles.addControls}><input id="custom-domain" name="hostname" value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="magazaniz.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /><button type="submit" disabled={busy !== null || !preview}>Alan adını bağla</button></div>
      {preview ? <div className={styles.preview} aria-live="polite"><span><small>Mağaza adresi</small>{preview.storefront}</span><span><small>Yönetim paneli</small>{preview.admin}<b>Otomatik oluşturulacak</b></span></div> : null}
    </form> : null}
    {error ? <p className={styles.error} role="alert">{error}<button type="button" onClick={() => void load()}>Tekrar dene</button></p> : null}
    <span className={styles.srOnly} aria-live="polite">{copied ? "DNS değeri kopyalandı" : ""}</span>
    {loading ? <p className={styles.loading} role="status">Yükleniyor…</p> : <>
      <div className={styles.list}>{customDomains.map((domain) => {
        const adminHostname = previewDomainBundle(domain.hostname)?.admin;
        const admin = adminDomains.find((candidate) => !candidate.fallback && candidate.hostname === adminHostname);
        return <BundleCard key={domain.id} storefront={domain} admin={admin} canManage={canManage} busy={busy === domain.id || busy === admin?.id} copied={copied} onCopy={copy} onStoreAction={(action) => void mutateStorefront(domain, action)} onAdminRecheck={() => void recheckAdmin(admin)} />;
      })}{customDomains.length === 0 ? <p className={styles.empty}>Henüz özel mağaza alan adı bağlanmadı.</p> : null}</div>
      <details className={styles.fallbacks}><summary>Teknik kurtarma adresleri</summary><div>{platformDomains.map((domain) => <p key={domain.id}><span><small>Mağaza yedek adresi</small><a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">{domain.hostname}</a></span><b>Teknik yedek</b></p>)}{platformAdminDomains.map((domain) => <p key={domain.id}><span><small>Yönetim paneli yedek adresi</small><a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer">{domain.hostname}</a></span><b>Teknik yedek</b></p>)}</div></details>
    </>}
  </section>;
}
