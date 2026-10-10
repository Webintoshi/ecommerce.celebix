"use client";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { luckyWheelRewardConditions, type LuckyWheelPublicCampaign, type LuckyWheelSpinResult } from "@celebix/saas-contracts";
import { createLuckyWheelClient, createWheelParticipation, LuckyWheelClientError, wheelLandingAngle } from "../lib/lucky-wheel/client.ts";
import { readWheelParticipationOperation, rememberPendingWheelCoupon, rememberWheelParticipationOperation } from "../lib/engagement/integration.ts";
import { LuckyWheelGraphic, luckyWheelInk } from "./LuckyWheelGraphic.tsx";
import styles from "./LuckyWheel.module.css";

type Props = Readonly<{ campaign: LuckyWheelPublicCampaign; storefrontId: string; storefrontName: string; onClose(): void; applyCoupon(code: string, origin?: "wheel"): Promise<string> }>;
function message(error: unknown) {
  if (error instanceof LuckyWheelClientError) {
    if (error.code === "invalid_input") return "Geçerli bir e-posta adresi veya telefon girin.";
    if (error.code === "version_conflict") return "Çark koşulları değişti. Yeni koşulları görmek için sayfayı yenileyin.";
    if (["campaign_unavailable", "quota_exhausted"].includes(error.code)) return "Bu çark şu anda yeni katılım almıyor.";
    if (error.code === "repeat_limited") return "Bu tarayıcıdan katılım hakkı henüz yenilenmedi. Önceki sonucunuzu kontrol edin.";
    if (error.code === "operation_mismatch") return "Önceki isteğin iletişim bilgileriyle yeniden deneyin. İşlem kimliğiniz korunuyor.";
    if (error.code === "rate_limited") return "Biraz bekleyip yeniden deneyin. İşlem kimliğiniz korunuyor.";
  }
  return "Sonuç henüz doğrulanamadı. İşlem kimliğiniz korunuyor; önce sonucunuzu kontrol edin.";
}
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export function LuckyWheel({ campaign: initialCampaign, storefrontId, storefrontName, onClose, applyCoupon }: Props) {
  const [campaign, setCampaign] = useState(initialCampaign), [clock, setClock] = useState(Date.now());
  const headingId = useId(), dialog = useRef<HTMLElement | null>(null), alive = useRef(true), busy = useRef(false);
  const [channel, setChannel] = useState<"email" | "phone">(campaign.collectMode === "phone" ? "phone" : "email"), [contact, setContact] = useState(""), [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(""), [locked, setLocked] = useState(false);
  const [award, setAward] = useState<LuckyWheelSpinResult | null>(null), [animating, setAnimating] = useState(false), [angle, setAngle] = useState(0), [status, setStatus] = useState("");
  const operation = useRef<string | null>(null), participation = useRef<ReturnType<typeof createWheelParticipation> | null>(null);
  if (!participation.current) participation.current = createWheelParticipation(createLuckyWheelClient(), { read() { return readWheelParticipationOperation(storefrontId, initialCampaign.id); }, write(value) { operation.current = value; rememberWheelParticipationOperation(storefrontId, initialCampaign.id, value); } });
  const installAward = useCallback((result: LuckyWheelSpinResult, animate = false) => {
    setAward(result); setLocked(true); setContact("");
    const valid = ["active", "held"].includes(result.couponStatus) && Date.parse(result.expiresAt) > Date.now();
    if (valid) rememberPendingWheelCoupon(storefrontId, result);
    if (campaign.prizes.some(prize => prize.id === result.prizeId)) setAngle(wheelLandingAngle(campaign.prizes, result.prizeId));
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setAnimating(animate && !reduced);
  }, [campaign, storefrontId]);
  const recover = useCallback(async () => { if (busy.current) return; busy.current = true; setLoading(true); setError(""); try { const result = await participation.current!.recover(campaign); if (alive.current && result) installAward(result); } catch (failure) { if (alive.current) setError(message(failure)); } finally { busy.current = false; if (alive.current) setLoading(false); } }, [campaign, installAward]);
  useEffect(() => { alive.current = true; void recover(); return () => { alive.current = false; }; }, [recover]);
  useEffect(() => {
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("input, button")?.focus());
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } else if (event.key === "Tab") { const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]') ?? [])]; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    document.addEventListener("keydown", keydown); return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); };
  }, [onClose]);
  useEffect(() => { if (!animating) return; const timer = window.setTimeout(() => setAnimating(false), 4100); return () => window.clearTimeout(timer); }, [animating]);
  useEffect(() => { if (!award) return; const expiry = Date.parse(award.expiresAt); if (expiry <= clock) return; const timer = window.setTimeout(() => setClock(Date.now()), Math.min(expiry - Date.now() + 1, 2147483647)); return () => window.clearTimeout(timer); }, [award, clock]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy.current || loading || award || animating) return;
    busy.current = true; setPending(true); setError("");
    try { const result = await participation.current!.spin(campaign, { [channel]: contact, marketingConsent: consent }); if (alive.current) installAward(result, true); }
    catch (failure) { if (alive.current) { setError(message(failure)); setLocked(Boolean(operation.current)); if (failure instanceof LuckyWheelClientError && failure.code === "version_conflict") { const fresh = await createLuckyWheelClient().settings().catch(() => null); if (alive.current && fresh?.campaign?.id === campaign.id) { setCampaign(fresh.campaign); setError("Çark koşulları yenilendi. Yeni oran ve koşulları kontrol ederek yeniden çevirebilirsiniz."); } } } }
    finally { busy.current = false; if (alive.current) setPending(false); }
  };
  const valid = Boolean(award && ["active", "held"].includes(award.couponStatus) && Date.parse(award.expiresAt) > clock);
  const apply = async () => { if (!award || !valid || busy.current) return; busy.current = true; setPending(true); try { const next = await applyCoupon(award.couponCode, "wheel"); if (alive.current) setStatus(next); } finally { busy.current = false; if (alive.current) setPending(false); } };
  const copy = async () => { if (!award) return; try { if (!window.navigator.clipboard) throw Error(); await window.navigator.clipboard.writeText(award.couponCode); setStatus("Kod kopyalandı."); } catch { setStatus("Görünen kodu seçerek kopyalayabilirsiniz."); } };
  const expired = award && (award.couponStatus === "expired" || Date.parse(award.expiresAt) <= clock);
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} data-lucky-wheel style={{ "--wheel-accent": campaign.appearance.accent, "--wheel-background": campaign.appearance.background, "--wheel-ink": luckyWheelInk(campaign.appearance.background), "--wheel-muted": luckyWheelInk(campaign.appearance.background), "--wheel-line": luckyWheelInk(campaign.appearance.background) === "#ffffff" ? "#ffffff40" : "#00000025" } as CSSProperties}>
      <button className={styles.close} type="button" aria-label="Çarkı kapat" onClick={onClose}>×</button>
      <div className={styles.illustration}><LuckyWheelGraphic prizes={campaign.prizes} appearance={campaign.appearance} angle={angle} animate={animating} prizeId={award?.prizeId} onAnimationEnd={() => setAnimating(false)} /><span className={styles.store}>{storefrontName}</span></div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>ŞANS ÇARKI</p><h2 id={headingId}>{award && !animating ? "Kuponunuz hazır" : campaign.heading}</h2>
        {loading ? <p role="status">Önceki sonucunuzu kontrol ediyoruz…</p> : award ? animating ? <p role="status">Kaydedilen ödülünüz gösteriliyor…</p> : <div className={styles.result} role="status" aria-live="polite">
          <h3>{award.label}</h3><p>Kupon kodunuz</p><strong className={styles.code}>{award.couponCode}</strong>
          <p>{expired ? "Kuponunuzun süresi sona erdi." : award.couponStatus === "used" ? "Bu kupon kullanıldı." : award.couponStatus === "revoked" ? "Bu kupon iptal edildi." : `Son kullanım: ${date(award.expiresAt)}`}</p>
          <ul>{luckyWheelRewardConditions(award.ruleDocument).map(condition => <li key={condition}>{condition}</li>)}</ul>
          <p className={styles.hint}>Kod toplam bir kez kullanılabilir. Başka cihazda da kodla kullanabilirsiniz; kodu paylaşmanız halinde ilk geçerli kullanım hakkı tüketir.</p>
          <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => { void copy(); }}>Kodu kopyala</button>{valid ? <button type="button" className={styles.primary} data-wheel-apply disabled={pending} onClick={() => { void apply(); }}>{pending ? "Kontrol ediliyor…" : "Sepete uygula"}</button> : null}</div>
          {status ? <p>{status}</p> : null}<button type="button" className={styles.link} onClick={onClose}>Alışverişe devam et</button>
          <p className={styles.hint}>Bu tarayıcıdan yeniden katılım: {date(award.repeatEligibleAt)}</p>
          {Date.parse(award.repeatEligibleAt) <= Date.now() ? <button type="button" data-wheel-new-participation className={styles.secondary} onClick={() => { setAward(null); setLocked(false); setConsent(false); setContact(""); setError(""); }}>Yeni katılım</button> : null}
        </div> : <><p className={styles.body}>{campaign.body}</p><form noValidate onSubmit={event => { void submit(event); }}>
          {campaign.collectMode === "either" ? <div className={styles.channels} role="group" aria-label="İletişim yöntemi"><button type="button" aria-pressed={channel === "email"} disabled={locked || pending} onClick={() => { setChannel("email"); setContact(""); }}>E-posta</button><button type="button" aria-pressed={channel === "phone"} disabled={locked || pending} onClick={() => { setChannel("phone"); setContact(""); }}>Telefon</button></div> : null}
          <label className={styles.field}>{channel === "email" ? "E-posta adresiniz" : "Telefonunuz"}<input type={channel === "email" ? "email" : "tel"} autoComplete={channel} inputMode={channel === "email" ? "email" : "tel"} maxLength={channel === "email" ? 254 : 32} value={contact} disabled={pending || locked} required onInput={event => setContact(event.currentTarget.value)} placeholder={channel === "email" ? "ornek@eposta.com" : "05xx xxx xx xx"} /></label>
          <p className={styles.hint}>Üyelik gerekmez. İletişim bilginiz katılım için kaydedilir; kuponunuz burada gösterilir.</p>
          <label className={styles.consent}><input type="checkbox" checked={consent} disabled={pending || locked} onChange={event => setConsent(event.currentTarget.checked)} /><span>{campaign.marketingOptInLabel}</span></label>
          <button className={styles.primary} type="submit" disabled={pending || loading}>{pending ? "Ödülünüz kaydediliyor…" : locked ? "Aynı işlemi yeniden dene" : "Çevir ve kupon kazan"}</button>
        </form></>}
        {error ? <><p className={styles.error} role="alert">{error}</p><button className={styles.secondary} type="button" disabled={loading || pending} onClick={() => { void recover(); }}>Sonucumu kontrol et</button></> : null}
        <details className={styles.odds}><summary>Ödüller ve kazanma oranları</summary><p>Dilimler eşit büyüklüktedir; kazanma oranları farklı olabilir.</p><ul>{campaign.prizes.map(prize => <li key={prize.id}><strong>{prize.label} · %{(prize.weightBps / 100).toLocaleString("tr-TR")}</strong><ul>{luckyWheelRewardConditions(prize.ruleDocument).map(condition => <li key={condition}>{condition}</li>)}</ul></li>)}</ul></details>
        <p className={styles.hint}>Bu tarayıcıdan {campaign.repeatDays} günde bir katılım. Kupon kazanımdan sonra en fazla {campaign.couponHours} saat geçerlidir; ödül koşullarındaki daha erken bitiş uygulanır.</p>
      </div>
    </section>
  </div>;
}
