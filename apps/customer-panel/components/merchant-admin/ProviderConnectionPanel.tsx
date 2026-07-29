"use client";

import type {
  MerchantAdminJson,
  MerchantProviderCapability,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
} from "@celebix/saas-contracts";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import {
  ProviderExecutionApiError,
  providerExecutionApi,
} from "@/lib/provider-execution-ui/client";

import styles from "./provider-connection-panel.module.css";

export type ProviderConnectionPanelProps = Readonly<{
  capability: MerchantProviderCapability;
  canManage: boolean;
}>;

type State = Readonly<{
  phase: "loading" | "ready" | "unavailable";
  definitions: readonly MerchantProviderDescriptor[];
  profiles: readonly MerchantProviderProfile[];
}>;

const INITIAL: State = Object.freeze({ phase: "loading", definitions: Object.freeze([]), profiles: Object.freeze([]) });

function status(profile: MerchantProviderProfile): Readonly<{ label: string; detail: string }> {
  if (profile.status === "active") return Object.freeze({ label: "Aktif", detail: "Kimlik bilgileri doğrulandı ve iş kuyruğu için kullanılabilir." });
  if (profile.status === "pending_validation") return Object.freeze({ label: "Doğrulama bekliyor", detail: "Bağlantı henüz harici işlem çalıştıramaz." });
  if (profile.status === "rotation_required") return Object.freeze({ label: "Anahtar yenileme gerekli", detail: "Yeni kimlik bilgisi girilene kadar iş kuyruğu kapalıdır." });
  if (profile.status === "disabled") return Object.freeze({ label: "Devre dışı", detail: "Bu bağlantı harici işlem çalıştıramaz." });
  return Object.freeze({ label: "İptal edildi", detail: "Bu bağlantı yeniden etkinleştirilemez." });
}

function publicValue(profile: MerchantProviderProfile | undefined, key: string): string {
  const value = profile?.publicConfig[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function ProviderConnectionPanel({ capability, canManage }: ProviderConnectionPanelProps) {
  const [state, setState] = useState<State>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    if (mounted.current) setState(INITIAL);
    try {
      const [definitions, profiles] = await Promise.all([
        providerExecutionApi.definitions(capability),
        providerExecutionApi.profiles(capability),
      ]);
      if (mounted.current && requestVersion.current === version) {
        setState(Object.freeze({ phase: "ready", definitions, profiles }));
      }
    } catch {
      if (mounted.current && requestVersion.current === version) {
        setState(Object.freeze({ phase: "unavailable", definitions: Object.freeze([]), profiles: Object.freeze([]) }));
      }
    }
  }, [capability]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; requestVersion.current += 1; };
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>, definition: MerchantProviderDescriptor, profile: MerchantProviderProfile | undefined) {
    event.preventDefault();
    if (busy || profile?.status === "revoked") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const publicConfig: Record<string, MerchantAdminJson> = {};
    const credential: Record<string, string> = {};
    for (const field of definition.publicFields) publicConfig[field.key] = String(data.get(field.key) ?? "").trim();
    for (const field of definition.credentialFields) credential[field.key] = String(data.get(field.key) ?? "");
    setBusy(true);
    setMessage("");
    try {
      await providerExecutionApi.save({
        providerCode: definition.providerCode,
        capability,
        publicConfig,
        credential,
        expectedVersion: profile?.version ?? 0,
        ...(profile ? { profileId: profile.id } : {}),
      });
      form.reset();
      setMessage(profile ? "Kimlik bilgileri yenilendi; doğrulama bekleniyor." : "Bağlantı kaydedildi; doğrulama bekleniyor.");
      await load();
    } catch (error) {
      setMessage(error instanceof ProviderExecutionApiError ? error.message : "Sağlayıcı bağlantısı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(kind: "disable" | "revoke", profile: MerchantProviderProfile) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await providerExecutionApi[kind](profile.id, profile.version);
      setMessage(kind === "disable" ? "Bağlantı devre dışı bırakıldı." : "Bağlantı kalıcı olarak iptal edildi.");
      await load();
    } catch (error) {
      setMessage(error instanceof ProviderExecutionApiError ? error.message : "Sağlayıcı bağlantısı güncellenemedi.");
    } finally { setBusy(false); }
  }

  return (
    <section className={styles.panel} aria-labelledby={`provider-connection-${capability}`}>
      <header>
        <div><span>Harici sağlayıcı</span><h2 id={`provider-connection-${capability}`}>Sağlayıcı bağlantıları</h2></div>
        <button type="button" onClick={() => void load()} disabled={busy || state.phase === "loading"}>Yenile</button>
      </header>

      {state.phase === "loading" ? <p role="status">Sağlayıcı bağlantıları yükleniyor…</p> : null}
      {state.phase === "unavailable" || (state.phase === "ready" && state.definitions.length === 0) ? (
        <div className={styles.disabled} role="status"><strong>Sağlayıcı adaptörü etkin değil</strong><p>Bu özellik için doğrulanmış bir sağlayıcı adaptörü kurulmadı; harici işlem yapılmaz.</p></div>
      ) : null}
      {message ? <p className={styles.message} role="status">{message}</p> : null}

      {state.phase === "ready" ? state.definitions.map((definition) => {
        const profile = state.profiles.find((candidate) => candidate.providerCode === definition.providerCode);
        const presentation = profile ? status(profile) : null;
        return (
          <article className={styles.connection} key={`${definition.providerCode}:${definition.capability}`}>
            <div className={styles.summary}>
              <div><strong>{definition.label}</strong><small>{definition.providerCode}</small></div>
              {profile ? <div className={styles.profile}><span>{presentation?.label}</span><strong>{profile.maskedAccountReference}</strong><small>{presentation?.detail}</small></div> : <p>Henüz bağlantı kurulmadı.</p>}
            </div>
            {canManage && profile?.status !== "revoked" ? (
              <form className={styles.form} onSubmit={(event) => void save(event, definition, profile)}>
                {definition.publicFields.map((field) => <label key={field.key}>{field.label}<input name={field.key} required maxLength={1000} defaultValue={publicValue(profile, field.key)} /></label>)}
                {definition.credentialFields.map((field) => <label key={field.key}>{field.label}<input name={field.key} required type="password" autoComplete="new-password" maxLength={16_384} /></label>)}
                <div className={styles.actions}>
                  <button className={styles.primary} disabled={busy}>{profile ? "Kimlik bilgisini yenile" : "Bağlantıyı kaydet"}</button>
                  {profile && profile.status !== "disabled" ? <button type="button" disabled={busy} onClick={() => void transition("disable", profile)}>Devre dışı bırak</button> : null}
                  {profile ? <button type="button" className={styles.danger} disabled={busy} onClick={() => void transition("revoke", profile)}>Kalıcı olarak iptal et</button> : null}
                </div>
              </form>
            ) : null}
          </article>
        );
      }) : null}
    </section>
  );
}
