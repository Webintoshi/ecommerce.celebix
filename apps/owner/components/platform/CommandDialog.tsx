"use client";

import { useEffect, useId, useRef, useState } from "react";
import { commandAttempt, CommandFailure, submitCommand, type Attempt } from "./command";
import type { CommandSpec, Draft } from "./types";
import { Button } from "./ui";
import { VerifiedAccountField } from "./VerifiedAccountField";

export function CommandDialog({ command, onClose, onCommitted, onRefresh }: { command: CommandSpec | null; onClose: () => void; onCommitted: () => void; onRefresh?: (draft: Draft) => Promise<number | undefined> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (command) { setDraft(command.initial); setExpectedVersion(command.expectedVersion); setError(null); setConflict(false); setUncertain(false); attempt.current = null; dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [command]);
  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command || busy) return;
    setError(null); setBusy(true);
    try {
      const payload = command.payload(draft);
      attempt.current = commandAttempt(attempt.current, command.action, payload, expectedVersion);
      const result = await submitCommand(command.endpoint, command.action, payload, expectedVersion, attempt.current.key);
      command.onSuccess?.(result, payload);
      onCommitted(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı.");
      setConflict(cause instanceof CommandFailure && cause.status === 409);
      setUncertain(cause instanceof CommandFailure && cause.uncertain);
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="platform-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); if (!busy && !uncertain) onClose(); }}>
    {command && <form onSubmit={event => void apply(event)}>
      <div className="platform-dialog-heading"><h2 id={titleId}>{command.title}</h2><p id={descriptionId}>{command.description}</p></div>
      <div className="platform-dialog-fields">{command.fields.map(field => <label key={field.name} className={field.type === "checkbox" ? "platform-check" : "platform-field"}><span>{field.label}{field.required ? " *" : ""}</span>
        {field.type === "verified-account" ? <VerifiedAccountField value={String(draft[field.name] ?? "")} disabled={busy || uncertain} onChange={id => setDraft(current => ({ ...current, [field.name]: id }))} /> : field.type === "checkbox" ? <input type="checkbox" checked={Boolean(draft[field.name])} disabled={busy || uncertain} onChange={event => setDraft(current => ({ ...current, [field.name]: event.target.checked }))} /> : field.type === "textarea" ? <textarea required={field.required} rows={3} disabled={busy || uncertain} value={String(draft[field.name] ?? "")} onChange={event => setDraft(current => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <select required={field.required} disabled={busy || uncertain} value={String(draft[field.name] ?? "")} onChange={event => setDraft(current => ({ ...current, [field.name]: event.target.value }))}><option value="">Seçin</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type || "text"} readOnly={field.readOnly} required={field.required} min={field.min} max={field.max} step={field.step} disabled={busy || uncertain} value={String(draft[field.name] ?? "")} onChange={event => setDraft(current => ({ ...current, [field.name]: event.target.value }))} />}
        {field.help && <small>{field.help}</small>}
      </label>)}</div>
      {error && <div className="platform-notice is-error" role="alert"><p>{error}</p>{conflict && onRefresh && <Button onClick={() => void (async () => { const version = await onRefresh(draft); if (version !== undefined) { setExpectedVersion(version); setConflict(false); setError("Güncel kayıt yüklendi. Taslağınızı kontrol ederek yeniden uygulayın."); } })()}>Güncel kaydı yükle</Button>}</div>}
      {uncertain && <p className="platform-dialog-note">Sonucu doğrulamak için aynı işlem anahtarıyla yeniden deneyin. Bu sırada taslak düzenlenemez.</p>}
      <div className="platform-dialog-footer"><Button onClick={onClose} disabled={busy || uncertain}>Vazgeç</Button><Button type="submit" primary disabled={busy || conflict}>{busy ? "Uygulanıyor…" : uncertain ? "Aynı işlemi yeniden dene" : "Uygula"}</Button></div>
    </form>}
  </dialog>;
}
