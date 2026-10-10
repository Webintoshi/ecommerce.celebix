"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { LuckyWheelPublicCampaign, LuckyWheelSpinResult } from "@celebix/saas-contracts";
import { createLuckyWheelClient } from "../lib/lucky-wheel/client.ts";
import { acquireEngagementModal, campaignWasShown, engagementRouteAllowed, getEngagementCart, markCampaignShown, releaseEngagementModal } from "../lib/engagement/integration.ts";
import styles from "./LuckyWheel.module.css";

const Wheel = dynamic(() => import("./LuckyWheel.tsx").then(module => module.LuckyWheel), { ssr: false });
const Result = dynamic(() => import("./LuckyWheelResult.tsx").then(module => module.LuckyWheelResult), { ssr: false });
function allowed(campaign: LuckyWheelPublicCampaign, pathname: string): boolean { return engagementRouteAllowed(pathname) && (campaign.allowedPaths.length === 0 || campaign.allowedPaths.some(path => pathname === path || path !== "/" && pathname.startsWith(`${path.replace(/\/$/, "")}/`))) && (window.innerWidth < 768 ? campaign.devices.mobile : campaign.devices.desktop); }
export function LuckyWheelLauncher({ storefrontId, storefrontName, applyCoupon }: Readonly<{ storefrontId: string; storefrontName: string; applyCoupon(code: string, origin?: "wheel"): Promise<string> }>) {
  const pathname = usePathname() ?? "/", [campaign, setCampaign] = useState<LuckyWheelPublicCampaign | null>(null), [active, setActive] = useState(false), [viewport, setViewport] = useState(0), [error, setError] = useState("");
  const [recoveredAward, setRecoveredAward] = useState<LuckyWheelSpinResult | null>(null), [showingResult, setShowingResult] = useState(false);
  const owner = useRef(Symbol("lucky-wheel")), opening = useRef(false), activeRef = useRef(false), alive = useRef(true), generation = useRef(0), trigger = useRef<HTMLElement | null>(null);
  const close = useCallback(() => { generation.current++; activeRef.current = false; opening.current = false; setActive(false); releaseEngagementModal(owner.current); window.requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); }); }, []);
  useEffect(() => { alive.current = true; const abort = new AbortController(), client = createLuckyWheelClient(); void Promise.allSettled([client.settings(abort.signal), Promise.resolve().then(() => client.recoverResult(abort.signal))]).then(([settings, recovered]) => { if (abort.signal.aborted) return; setCampaign(settings.status === "fulfilled" ? settings.value.campaign : null); setRecoveredAward(recovered.status === "fulfilled" ? recovered.value : null); }); const resize = () => setViewport(window.innerWidth); resize(); window.addEventListener("resize", resize); return () => { alive.current = false; generation.current++; abort.abort(); releaseEngagementModal(owner.current); window.removeEventListener("resize", resize); }; }, [storefrontId]);
  const routeAllowed = useCallback((path: string) => Boolean(recoveredAward ? engagementRouteAllowed(path) : campaign && allowed(campaign, path)), [campaign, recoveredAward]);
  useEffect(() => { if (!routeAllowed(pathname)) close(); }, [routeAllowed, pathname, viewport, close]);
  const open = useCallback(async (source?: HTMLElement, preferWheel = false) => {
    if (opening.current || activeRef.current || !routeAllowed(window.location.pathname) || preferWheel && (!campaign || !allowed(campaign, window.location.pathname))) return;
    if (!acquireEngagementModal(owner.current)) { setError("Açık pencereyi kapattıktan sonra çarkı açabilirsiniz."); return; }
    opening.current = true; const token = ++generation.current, route = `${window.location.pathname}${window.location.search}`; trigger.current = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null); setError("");
    try {
      const cart = getEngagementCart(storefrontId); if (cart && !await cart.closeDrawerAndWait(false)) return;
      if (!alive.current || token !== generation.current || route !== `${window.location.pathname}${window.location.search}` || !routeAllowed(window.location.pathname)) return;
      const other = [...document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]')].some(element => !element.hidden && window.getComputedStyle(element).display !== "none");
      if (other) { setError("Açık pencereyi kapattıktan sonra çarkı açabilirsiniz."); return; }
      activeRef.current = true; setShowingResult(Boolean(recoveredAward && !preferWheel)); if (campaign && (!recoveredAward || preferWheel)) markCampaignShown(storefrontId, `wheel:${campaign.id}`); setActive(true);
    } catch { setError("Çark açılamadı. Yeniden deneyebilirsiniz."); }
    finally { if (token === generation.current) opening.current = false; if (!activeRef.current) releaseEngagementModal(owner.current); }
  }, [campaign, recoveredAward, routeAllowed, storefrontId]);
  useEffect(() => {
    if (!campaign || campaign.scrollPercent === null || !allowed(campaign, pathname) || campaignWasShown(storefrontId, `wheel:${campaign.id}`, campaign.repeatDays)) return;
    const scroll = () => { const height = document.documentElement.scrollHeight - window.innerHeight; if (height > 0 && window.scrollY / height * 100 >= campaign.scrollPercent!) { window.removeEventListener("scroll", scroll); void open(undefined, true); } };
    window.addEventListener("scroll", scroll, { passive: true }); return () => window.removeEventListener("scroll", scroll);
  }, [campaign, pathname, viewport, storefrontId, open]);
  if (!routeAllowed(pathname)) return null;
  return <>{!active ? <button type="button" className={styles.launcher} data-wheel-launcher onClick={event => { void open(event.currentTarget); }} aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="currentColor" strokeWidth="1.3" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>{recoveredAward ? "Kuponum" : "Şans çarkı"}</button> : null}{error && !active ? <p className={styles.launchError} role="status">{error}</p> : null}{active && showingResult && recoveredAward ? <Result award={recoveredAward} storefrontId={storefrontId} storefrontName={storefrontName} onClose={close} applyCoupon={applyCoupon} onOpenWheel={campaign && allowed(campaign, pathname) ? () => setShowingResult(false) : undefined} /> : active && campaign ? <Wheel campaign={campaign} storefrontId={storefrontId} storefrontName={storefrontName} onClose={close} applyCoupon={applyCoupon} /> : null}</>;
}
