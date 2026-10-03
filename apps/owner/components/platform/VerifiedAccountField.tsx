"use client";

import { useEffect, useState } from "react";
import { usePlatformResource } from "./resource";

type Candidates = { available: boolean; observedAt?: string; candidates?: { id: string; email: string; verified: boolean }[] };
export function VerifiedAccountField({ email, selectedId, disabled, onChange }: { email: string; selectedId: string; disabled: boolean; onChange: (email: string, id: string) => void }) {
  const [lookupEmail, setLookupEmail] = useState("");
  useEffect(() => { const timer = setTimeout(() => setLookupEmail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.trim().toLowerCase() : ""), 400); return () => clearTimeout(timer); }, [email]);
  const candidates = usePlatformResource<Candidates>(lookupEmail ? `/api/platform/invitations?email=${encodeURIComponent(lookupEmail)}` : null);
  return <span className="platform-verified-account"><input type="email" required aria-label="Davet edilecek e-posta" value={email} disabled={disabled} placeholder="ornek@magaza.com" onChange={event => onChange(event.target.value, "")} /><select aria-label="Mevcut doğrulanmış hesap (isteğe bağlı)" value={selectedId} disabled={disabled || candidates.loading || Boolean(candidates.error) || lookupEmail !== email.trim().toLowerCase()} onChange={event => onChange(email, event.target.value)}><option value="">E-posta adresine davet et</option>{candidates.data?.candidates?.filter(candidate => candidate.verified && candidate.email.trim().toLowerCase() === lookupEmail).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.email} · Doğrulanmış hesap</option>)}</select><small aria-live="polite">{candidates.loading ? "Mevcut hesap kontrol ediliyor…" : candidates.error ? "Mevcut hesap kontrolü alınamadı. E-posta davetiyle devam edebilirsiniz." : "Mevcut hesabı varsa seçebilirsiniz. Yeni kullanıcı, e-postasını doğrulayıp daveti kabul edince erişim kazanır."}</small></span>;
}
