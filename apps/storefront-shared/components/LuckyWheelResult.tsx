"use client";
import { useEffect, useId, useRef, useState } from "react";
import { luckyWheelRewardConditions, type LuckyWheelSpinResult } from "@celebix/saas-contracts";
import { rememberPendingWheelCoupon } from "../lib/engagement/integration.ts";
import styles from "./LuckyWheel.module.css";

export function LuckyWheelResult({ award, storefrontId, storefrontName, onClose, applyCoupon, onOpenWheel }: Readonly<{ award: LuckyWheelSpinResult; storefrontId: string; storefrontName: string; onClose(): void; applyCoupon(code: string, origin?: "wheel"): Promise<string>; onOpenWheel?: () => void }>) {
  const headingId = useId(), dialog = useRef<HTMLElement | null>(null), alive = useRef(true), busy = useRef(false);
  const [clock, setClock] = useState(Date.now()), [pending, setPending] = useState(false), [status, setStatus] = useState("");
  const valid = ["active", "held"].includes(award.couponStatus) && Date.parse(award.expiresAt) > clock;
  const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  useEffect(() => { if (valid) rememberPendingWheelCoupon(storefrontId, award); }, [award, storefrontId, valid]);
  useEffect(() => {
    alive.current = true; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("button")?.focus());
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } else if (event.key === "Tab") { const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? [])]; if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); } } };
    document.addEventListener("keydown", keydown); return () => { alive.current = false; window.cancelAnimationFrame(frame); document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); };
  }, [onClose]);
  useEffect(() => { const expiry = Date.parse(award.expiresAt); if (expiry <= clock) return; const timer = window.setTimeout(() => setClock(Date.now()), Math.min(expiry - Date.now() + 1, 2147483647)); return () => window.clearTimeout(timer); }, [award, clock]);
  const apply = async () => { if (!valid || busy.current) return; busy.current = true; setPending(true); try { const next = await applyCoupon(award.couponCode, "wheel"); if (alive.current) setStatus(next); } catch { if (alive.current) setStatus("Kodunuz korunuyor. Yeniden deneyebilirsiniz."); } finally { busy.current = false; if (alive.current) setPending(false); } };
  const copy = async () => { try { if (!window.navigator.clipboard) throw Error(); await window.navigator.clipboard.writeText(award.couponCode); if (alive.current) setStatus("Kod kopyalandı."); } catch { if (alive.current) setStatus("Görünen kodu seçerek kopyalayabilirsiniz."); } };
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={`${styles.dialog} ${styles.resultDialog}`} role="dialog" aria-modal="true" aria-labelledby={headingId} data-lucky-wheel-result>
      <button type="button" className={styles.close} aria-label="Kupon penceresini kapat" onClick={onClose}>×</button>
      <div className={styles.content}><p className={styles.eyebrow}>{storefrontName} · ŞANS ÇARKI</p><h2 id={headingId}>Kuponunuz</h2>
        <div className={styles.result} role="status" aria-live="polite"><h3>{award.label}</h3><p>Kupon kodunuz</p><strong className={styles.code}>{award.couponCode}</strong>
          <p>{Date.parse(award.expiresAt) <= clock || award.couponStatus === "expired" ? "Kuponunuzun süresi sona erdi." : award.couponStatus === "revoked" ? "Bu kupon iptal edildi." : award.couponStatus === "used" ? "Bu kupon kullanıldı." : `Son kullanım: ${date(award.expiresAt)}`}</p>
          <ul>{luckyWheelRewardConditions(award.ruleDocument).map(condition => <li key={condition}>{condition}</li>)}</ul><p className={styles.hint}>Kod toplam bir kez kullanılabilir. Başka cihazda da kodla kullanabilirsiniz; ilk geçerli kullanım hakkı tüketir.</p>
          <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => { void copy(); }}>Kodu kopyala</button>{valid ? <button className={styles.primary} type="button" data-wheel-apply disabled={pending} onClick={() => { void apply(); }}>{pending ? "Kontrol ediliyor…" : "Sepete uygula"}</button> : null}</div>{status ? <p>{status}</p> : null}
          <button className={styles.link} type="button" onClick={onClose}>Alışverişe devam et</button>
        </div>{onOpenWheel ? <button className={styles.secondary} type="button" onClick={onOpenWheel}>Çarkı aç</button> : <p className={styles.hint}>Bu çark şu anda yeni katılım almıyor. Verilmiş kuponunuzun koşulları ve son kullanım zamanı korunur.</p>}
      </div>
    </section>
  </div>;
}
