"use client";

import { useEffect, useState } from "react";
import { usePlatformResource } from "./resource";

type Candidates = { available: boolean; observedAt?: string; candidates?: { id: string; email: string; verified: boolean }[] };
export function VerifiedAccountField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (id: string) => void }) {
  const [email, setEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  useEffect(() => { const timer = setTimeout(() => setLookupEmail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.trim().toLowerCase() : ""), 400); return () => clearTimeout(timer); }, [email]);
  const candidates = usePlatformResource<Candidates>(lookupEmail ? `/api/platform/invitations?email=${encodeURIComponent(lookupEmail)}` : null);
  return <span className="platform-verified-account"><input type="email" aria-label="Hedef hesabın e-postası" value={email} disabled={disabled} placeholder="Doğrulanmış hesap e-postası" onChange={event => { setEmail(event.target.value); onChange(""); }} /><select aria-label="Doğrulanmış hedef hesap" required value={value} disabled={disabled || candidates.loading || Boolean(candidates.error) || lookupEmail !== email.trim().toLowerCase()} onChange={event => onChange(event.target.value)}><option value="">Doğrulanmış hesabı seçin</option>{candidates.data?.candidates?.filter(candidate => candidate.verified).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.email}</option>)}</select><small aria-live="polite">{candidates.loading ? "Hesap doğrulaması kontrol ediliyor…" : candidates.error || (candidates.data && !candidates.data.candidates?.length ? "Bu e-posta için doğrulanmış ortak hesap bulunamadı." : "Hesabın e-postasını girip doğrulanmış eşleşmeyi seçin.")}</small></span>;
}
