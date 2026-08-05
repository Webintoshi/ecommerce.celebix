"use client";

import type { StoreDomainDnsInstruction, StoreDomainView } from "@celebix/saas-contracts";
import { Check, Copy, ExternalLink, Globe2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { StoreDomainApiError, storeDomainApi } from "@/lib/store-domain-ui/client";
import { getStoreDomainProgress, getStoreDomainStatusPresentation } from "@/lib/store-domain-ui/presentation";
import styles from "./store-domain-settings.module.css";

const STEPS = Object.freeze(["Alan adı", "DNS", "SSL", "Yayında"] as const);

function replaceDomain(items: readonly StoreDomainView[], next: StoreDomainView): readonly StoreDomainView[] {
  const selected = [...items.filter(({ id }) => id !== next.id), next].filter(({ status }) => status !== "disabled");
  return Object.freeze(selected.sort((left, right) => Number(right.primary) - Number(left.primary) || left.hostname.localeCompare(right.hostname, "tr")));
}

function Status({ domain }: Readonly<{ domain: StoreDomainView }>) {
  const status = getStoreDomainStatusPresentation(domain);
  return <span className={`${styles.status} ${styles[status.tone]}`}><i aria-hidden="true" />{status.label}</span>;
}

function Progress({ domain }: Readonly<{ domain: StoreDomainView }>) {
  const progress = getStoreDomainProgress(domain);
  return <ol className={styles.progress} aria-label="Bağlantı durumu">{STEPS.map((label, index) => <li key={label} className={index < progress ? styles.complete : ""}><span>{index < progress ? <Check size={12} strokeWidth={3} /> : index + 1}</span><small>{label}</small></li>)}</ol>;
}

function DnsRow({ instruction, copied, onCopy }: Readonly<{ instruction: StoreDomainDnsInstruction; copied: string | null; onCopy(value: string): void }>) {
  const key = `${instruction.type}:${instruction.name}:${instruction.value}`;
  return <div className={styles.dnsRow}><strong>{instruction.type}</strong><span><small>Ad</small><code>{instruction.name}</code></span><span><small>Değer</small><code>{instruction.value}</code></span><button type="button" onClick={() => onCopy(instruction.value)} aria-label="DNS değerini kopyala">{copied === key ? <Check size={17} /> : <Copy size={17} />}</button></div>;
}

function DomainRow({ domain, canManage, busy, copied, onCopy, onRecheck, onPrimary, onRemove }: Readonly<{
  domain: StoreDomainView; canManage: boolean; busy: boolean; copied: string | null;
  onCopy(instruction: StoreDomainDnsInstruction): void; onRecheck(): void; onPrimary(): void; onRemove(): void;
}>) {
  const platform = domain.hostnameType === "platform_subdomain";
  return <article className={styles.domainRow}>
    <div className={styles.domainHeading}>
      <span className={styles.domainIcon} aria-hidden="true"><Globe2 size={20} /></span>
      <div><div className={styles.hostname}><strong>{domain.hostname}</strong>{domain.primary ? <span>Birincil</span> : null}</div><Status domain={domain} /></div>
      <a href={`https://${domain.hostname}`} target="_blank" rel="noreferrer" aria-label={`${domain.hostname} adresini aç`}><ExternalLink size={18} /></a>
    </div>
    {!platform ? <>
      <Progress domain={domain} />
      {domain.dnsInstructions.length > 0 ? <div className={styles.dnsList}>{domain.dnsInstructions.map((instruction) => {
        const key = `${instruction.type}:${instruction.name}:${instruction.value}`;
        return <DnsRow key={key} instruction={instruction} copied={copied} onCopy={() => onCopy(instruction)} />;
      })}</div> : null}
      {canManage ? <div className={styles.actions}>
        {domain.status !== "active" ? <button type="button" disabled={busy} onClick={onRecheck}><RefreshCw size={16} />Kontrol et</button> : null}
        {domain.status === "active" && !domain.primary ? <button type="button" disabled={busy} onClick={onPrimary}><Star size={16} />Birincil yap</button> : null}
        <button type="button" className={styles.remove} disabled={busy} onClick={onRemove}><Trash2 size={16} />Kaldır</button>
      </div> : null}
    </> : null}
  </article>;
}

export function StoreDomainSettings({ canManage }: Readonly<{ canManage: boolean }>) {
  const [domains, setDomains] = useState<readonly StoreDomainView[]>([]);
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const items = await storeDomainApi.list();
      if (mounted.current) { setDomains(items.filter(({ status }) => status !== "disabled")); setError(null); }
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

  const customDomains = useMemo(() => domains.filter(({ hostnameType }) => hostnameType === "custom_domain"), [domains]);
  const platformDomains = useMemo(() => domains.filter(({ hostnameType }) => hostnameType === "platform_subdomain"), [domains]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy("create"); setError(null);
    try { const created = await storeDomainApi.create(hostname); if (mounted.current) { setDomains((current) => replaceDomain(current, created)); setHostname(""); } }
    catch (caught) { if (mounted.current) setError(caught instanceof StoreDomainApiError ? caught.message : "Alan adı eklenemedi."); }
    finally { if (mounted.current) setBusy(null); }
  };

  const mutate = async (domain: StoreDomainView, action: "recheck" | "primary" | "remove") => {
    if (!canManage || busy) return;
    setBusy(domain.id); setError(null);
    try {
      const next = action === "recheck" ? await storeDomainApi.recheck(domain.id, domain.version)
        : action === "primary" ? await storeDomainApi.makePrimary(domain.id, domain.version)
          : await storeDomainApi.remove(domain.id, domain.version);
      if (mounted.current) setDomains((current) => replaceDomain(current.map((item) => action === "primary" && item.id !== next.id ? { ...item, primary: false } : item), next));
    } catch (caught) { if (mounted.current) setError(caught instanceof StoreDomainApiError ? caught.message : "İşlem tamamlanamadı."); }
    finally { if (mounted.current) setBusy(null); }
  };

  const copy = async (instruction: StoreDomainDnsInstruction) => {
    const key = `${instruction.type}:${instruction.name}:${instruction.value}`;
    try { await navigator.clipboard.writeText(instruction.value); setCopied(key); window.setTimeout(() => { if (mounted.current) setCopied(null); }, 1_800); }
    catch { setError("DNS değeri kopyalanamadı."); }
  };

  return <section className={styles.page} data-panel-layout="open-canvas">
    <PanelTopbarBridge title="Alan Adı" />
    <h1 className={styles.srOnly}>Alan Adı</h1>
    {canManage ? <form className={styles.add} onSubmit={create}>
      <label htmlFor="custom-domain">Yeni alan adı</label>
      <div><span>https://</span><input id="custom-domain" name="hostname" value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="magazaniz.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /><button type="submit" disabled={busy !== null || hostname.trim().length < 4}><Plus size={17} />Ekle</button></div>
    </form> : null}
    {error ? <p className={styles.error} role="alert">{error}<button type="button" onClick={() => void load()}>Tekrar dene</button></p> : null}
    {loading ? <p className={styles.loading} role="status">Yükleniyor…</p> : <div className={styles.list}>
      {platformDomains.map((domain) => <DomainRow key={domain.id} domain={domain} canManage={false} busy={false} copied={copied} onCopy={copy} onRecheck={() => undefined} onPrimary={() => undefined} onRemove={() => undefined} />)}
      {customDomains.map((domain) => <DomainRow key={domain.id} domain={domain} canManage={canManage} busy={busy === domain.id} copied={copied} onCopy={copy} onRecheck={() => void mutate(domain, "recheck")} onPrimary={() => void mutate(domain, "primary")} onRemove={() => { if (window.confirm(`${domain.hostname} kaldırılsın mı?`)) void mutate(domain, "remove"); }} />)}
      {domains.length === 0 ? <p className={styles.empty}>Mağaza adresi bulunamadı.</p> : null}
    </div>}
  </section>;
}
