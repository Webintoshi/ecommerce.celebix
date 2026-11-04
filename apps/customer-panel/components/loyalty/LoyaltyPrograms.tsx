"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Pause, Play, Plus, RotateCcw } from "lucide-react";
import type { LoyaltyProgram, LoyaltyReport, LoyaltyTemplate } from "@celebix/saas-contracts";
import { PanelPageHeader, PanelStatusBadge } from "../panel/PanelPageShell";
import { PanelInitialDataGate } from "../panel/PanelInitialDataGate";
import { PromotionIllustration } from "../promotions/PromotionIllustration";
import { formatLoyaltyMoney, LOYALTY_TEMPLATES, loyaltySummary } from "./model";
import { listLoyaltyPrograms, loyaltyCommand, loyaltyError, LOYALTY_PENDING_EVENT, mutateLoyaltyProgram, pendingLoyaltyOperation, readLoyaltyReport } from "./client";
import { parseMinorUnits } from "../../lib/in-store-sales-ui/model";
import styles from "./loyalty.module.css";

export type LoyaltyPermissions = Readonly<{ canManage: boolean; canPublish: boolean }>;
const STATUSES = { active: "Etkin", scheduled: "Planlandı", paused: "Duraklatıldı" };

export function useLoyaltyPending() {
  const [pending, setPending] = useState<ReturnType<typeof pendingLoyaltyOperation>>(null);
  useEffect(() => { const update = () => setPending(pendingLoyaltyOperation()); update(); window.addEventListener(LOYALTY_PENDING_EVENT, update); return () => window.removeEventListener(LOYALTY_PENDING_EVENT, update); }, []);
  return pending;
}
export function LoyaltyRecovery({ onRecovered }: Readonly<{ onRecovered: (program?: LoyaltyProgram) => void }>) {
  const pending = useLoyaltyPending();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (!pending) return null;
  return <div className={styles.notice} role="status"><p>{message || "Önceki işlemin sonucu henüz doğrulanmadı. Yeni bir işlemden önce sonucunu kontrol edin."}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => {
    setBusy(true);
    void loyaltyCommand(pending.action as "save" | "pause" | "duplicate" | "adjust", pending.payload, true).then(result => { onRecovered(typeof result === "object" && result !== null && "program" in result ? result.program as LoyaltyProgram : undefined); }).catch(error => { setMessage(loyaltyError(error)); }).finally(() => setBusy(false));
  }}>{busy ? "Kontrol ediliyor…" : "İşlemin sonucunu kontrol et"}</button></div>;
}

export function LoyaltyTemplatePicker({ onSelect }: Readonly<{ onSelect: (template: LoyaltyTemplate) => void }>) {
  return <div className={styles.templates}>{LOYALTY_TEMPLATES.map(template => <button className={styles.template} key={template.id} type="button" onClick={() => onSelect(template.id)}>
    <PromotionIllustration kind={template.art} className={styles.art}/><span><strong>{template.title}</strong><small>{template.help}</small></span><ArrowRight size={20} aria-hidden="true"/>
  </button>)}</div>;
}

export function LoyaltyProgramList({ canManage, canPublish }: LoyaltyPermissions) {
  const [programs, setPrograms] = useState<readonly LoyaltyProgram[]>([]), [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [busy, setBusy] = useState<string | null>(null), [search, setSearch] = useState(""), [status, setStatus] = useState("");
  const actionPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void listLoyaltyPrograms(controller.signal).then(result => { if (!controller.signal.aborted) { setPrograms(result.programs); setLoaded(true); setError(""); } }).catch(reason => { if (!controller.signal.aborted) { setError(loyaltyError(reason)); setLoaded(true); } });
    return () => controller.abort();
  }, [retry]);
  async function action(program: LoyaltyProgram, kind: "pause" | "resume" | "duplicate") {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(program.id); setError("");
    try {
      const result = kind === "resume" ? await mutateLoyaltyProgram("save", { programId: program.id, expectedVersion: program.version, name: program.name, enabled: true, config: program.config }) : await mutateLoyaltyProgram(kind, { programId: program.id, expectedVersion: program.version });
      if (kind === "duplicate") window.location.assign(`/discounts/loyalty/${result.program.id}`);
      else setPrograms(current => current.map(row => row.id === result.program.id ? result.program : row));
    } catch (reason) { setError(loyaltyError(reason)); }
    finally { actionPending.current = false; setBusy(null); }
  }
  const rows = programs.filter(program => (!status || program.status === status) && program.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")));
  return <section className={styles.workspace}>
    <h1 className="sr-only">Sadakat programları</h1>
    <PanelPageHeader title="Sadakat programları" actions={canManage && canPublish ? <Link className={styles.primary} href="/discounts/loyalty/new"><Plus size={20} aria-hidden="true"/>Program oluştur</Link> : undefined}/>
    <LoyaltyRecovery onRecovered={() => setRetry(value => value + 1)}/>
    {error ? <div className={styles.notice} role="alert"><p>{error}</p><button className={styles.secondary} type="button" onClick={() => setRetry(value => value + 1)}>Listeyi yenile</button></div> : null}
    <PanelInitialDataGate pending={!loaded}>
      <div className={styles.toolbar}><label className={styles.search}><span className="sr-only">Program ara</span><input type="search" value={search} placeholder="Program ara" onChange={event => setSearch(event.target.value)}/></label><label className={styles.statusFilter}><span className="sr-only">Program durumu</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Tüm durumlar</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span className={styles.helper}>{programs.length} program</span></div>
      {!rows.length && !error ? <div className={styles.empty}><PromotionIllustration kind="gift" className={styles.emptyArt}/><h2>{programs.length ? "Aramanızla eşleşen program yok" : "İlk sadakat programınızı oluşturun"}</h2><p>{programs.length ? "Arama veya durum filtresini değiştirin." : "Hazır şablonlardan birini seçip hedefi ve ödülü belirleyin."}</p></div> : rows.length ? <div className={styles.tableScroll}><table className={styles.table} aria-label="Sadakat programları"><thead><tr><th>Program</th><th>Hedef ve ödül</th><th>Durum</th><th><span className="sr-only">İşlemler</span></th></tr></thead><tbody>{rows.map(program => <tr key={program.id}><td><Link href={`/discounts/loyalty/${program.id}`}>{program.name}</Link><small>{LOYALTY_TEMPLATES.find(template => template.id === program.config.template)?.title}</small></td><td>{loyaltySummary(program.config)}</td><td><PanelStatusBadge tone={program.status === "active" ? "success" : "neutral"}>{STATUSES[program.status]}</PanelStatusBadge></td><td><div className={styles.rowActions}><Link className={styles.secondary} href={`/discounts/loyalty/${program.id}/report`}>Rapor</Link>{canManage ? <button type="button" className={styles.secondary} disabled={busy === program.id} onClick={() => void action(program, "duplicate")} aria-label={`${program.name} programını çoğalt`}><Copy size={16} aria-hidden="true"/><span>Çoğalt</span></button> : null}{canPublish ? <button type="button" className={styles.secondary} disabled={busy === program.id} onClick={() => void action(program, program.status === "paused" ? "resume" : "pause")} aria-label={`${program.name} programını ${program.status === "paused" ? "devam ettir" : "duraklat"}`}>{program.status === "paused" ? <Play size={16} aria-hidden="true"/> : <Pause size={16} aria-hidden="true"/>}{program.status === "paused" ? "Devam ettir" : "Duraklat"}</button> : null}</div></td></tr>)}</tbody></table></div> : null}
    </PanelInitialDataGate>
  </section>;
}

export function LoyaltyProgramReport({ programId, canManage, canPublish }: LoyaltyPermissions & Readonly<{ programId: string }>) {
  const unresolved = useLoyaltyPending();
  const [report, setReport] = useState<LoyaltyReport | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [more, setMore] = useState(false);
  const [customerId, setCustomerId] = useState(""), [delta, setDelta] = useState(""), [reason, setReason] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    void readLoyaltyReport(programId, undefined, controller.signal).then(value => { if (!controller.signal.aborted) { setReport(value); setError(""); } }).catch(value => { if (!controller.signal.aborted) setError(loyaltyError(value)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [programId, retry]);
  async function loadMore() {
    if (!report?.nextCursor || more) return;
    setMore(true);
    try { const next = await readLoyaltyReport(programId, report.nextCursor); setReport(current => current ? { ...next, members: [...current.members, ...next.members.filter(member => !current.members.some(existing => existing.customerId === member.customerId))] } : next); }
    catch (value) { setError(loyaltyError(value)); }
    finally { setMore(false); }
  }
  async function adjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!report || pending.current) return;
    const amount = parseMinorUnits(delta.replace(/^-/, ""));
    const value = report.program.config.template === "spend_discount" ? amount === null ? NaN : (delta.startsWith("-") ? -amount : amount) : Number(delta);
    if (!customerId || !/^-?\d+(?:[.,]\d{1,2})?$/.test(delta) || !Number.isSafeInteger(value) || value === 0 || reason.trim().length < 3) { setMessage("Müşteriyi seçin; sıfırdan farklı düzeltme ve en az üç karakterlik açıklama girin."); return; }
    pending.current = true; setBusy(true); setMessage("");
    try { await loyaltyCommand("adjust", { programId, customerId, delta: value, reason: reason.trim().replace(/\s+/g, " ") }); setDelta(""); setReason(""); setMessage("Düzeltme kaydedildi. Önceki hareketler korundu."); setRetry(value => value + 1); }
    catch (value) { setMessage(loyaltyError(value)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={styles.workspace}>
    <h1 className="sr-only">Sadakat programı raporu</h1><PanelPageHeader title="Sadakat raporu" actions={<Link className={styles.secondary} href="/discounts/loyalty">Programlara dön</Link>}/>
    <LoyaltyRecovery onRecovered={() => setRetry(value => value + 1)}/>
    {error ? <div role="alert" className={styles.notice}><p>{error}</p><button className={styles.secondary} type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw size={16} aria-hidden="true"/>Yeniden dene</button></div> : null}
    <PanelInitialDataGate pending={loading && !report}>{report ? <>
      <div className={styles.sectionHeading}><div><h2>{report.program.name}</h2><p>{loyaltySummary(report.program.config)}</p></div><Link className={styles.secondary} href={`/discounts/loyalty/${programId}`}>Programı görüntüle</Link></div>
      <div className={styles.metrics}>{[["İlerleyen müşteri", report.summary.members], ["Kazanılan ödül", report.summary.earned], ["Kullanılan ödül", report.summary.used], ["Kullanılabilir ödül", report.summary.available], ["Ödemede bekleyen", report.summary.reserved]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <p className={styles.helper}>Bilinen hediye maliyeti: {report.summary.knownCostMinor === null ? "Henüz hesaplanamıyor" : formatLoyaltyMoney(report.summary.knownCostMinor)}{report.summary.unknownCostRewards ? ` · ${report.summary.unknownCostRewards} ödülün maliyeti eksik.` : ""}</p>
      {report.members.length ? <div className={styles.tableScroll}><table className={styles.table} aria-label="Müşteri sadakat ilerlemesi"><thead><tr><th>Müşteri</th><th>İlerleme</th><th>Kazanılan</th><th>Kullanılan</th><th>Kalan</th></tr></thead><tbody>{report.members.map(member => <tr key={member.customerId}><td>{member.customerName || "Müşteri"}</td><td>{report.program.config.template === "spend_discount" ? `${formatLoyaltyMoney(member.progress)} / ${formatLoyaltyMoney(member.target)}` : `${member.progress} / ${member.target}`}</td><td>{member.earned}</td><td>{member.used}</td><td>{member.available}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><h2>Henüz ilerleme yok</h2><p>Program başladıktan sonraki uygun, ödenmiş alışverişler burada görünür.</p></div>}
      {report.nextCursor ? <button className={styles.secondary} type="button" disabled={more} onClick={() => void loadMore()}>{more ? "Yükleniyor…" : "Daha fazla müşteri"}</button> : null}
      {canManage && canPublish && report.members.length ? <details className={styles.details}>
        <summary>İlerleme düzeltmesi</summary>
        <form className={styles.form} onSubmit={event => void adjust(event)}>
          <p>Yalnız ilerlemeyi düzeltir. Para hareketi oluşturmaz; açıklamanız işlem geçmişinde saklanır.</p>
          <fieldset disabled={busy || Boolean(unresolved)}>
            <label className={styles.field}>Müşteri<select required value={customerId} onChange={event => setCustomerId(event.target.value)}><option value="">Müşteri seçin</option>{report.members.map(member => <option key={member.customerId} value={member.customerId}>{member.customerName || "Müşteri"}</option>)}</select></label>
            <label className={styles.field}>{report.program.config.template === "spend_discount" ? "Eklenecek / düşülecek tutar (TL)" : "Eklenecek / düşülecek ilerleme"}<input required inputMode="decimal" value={delta} onChange={event => setDelta(event.target.value)}/><small>Düşürmek için başına eksi koyun.</small></label>
            <label className={styles.field}>Düzeltme nedeni<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
          </fieldset>
          {message ? <p role="status">{message}</p> : null}
          <button className={styles.secondary} type="submit" disabled={busy || Boolean(unresolved)}>{busy ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}</button>
        </form>
      </details> : null}
    </> : null}</PanelInitialDataGate>
  </section>;
}
