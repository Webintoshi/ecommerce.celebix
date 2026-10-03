"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { revokeSupportCommand } from "./actions";
import { CommandDialog } from "./CommandDialog";
import { usePlatformResource } from "./resource";
import type { Audit, CommandSpec, Envelope, SupportSession } from "./types";
import { Badge, Button, dateTime, Empty, KeyValues, Panel, ResourceStatus, Screen, Table } from "./ui";

export const supportStatus = (session: SupportSession, now = Date.now()) => session.revokedAt ? "revoked" : Number.isNaN(Date.parse(session.expiresAt)) ? "unknown" : Date.parse(session.expiresAt) <= now ? "expired" : "active";
export function useSupportClock() { const [now, setNow] = useState(Date.now); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []); return now; }
export function AuditTable({ items }: { items: Audit[] }) {
  return items.length ? <Table headings={["İşlem", "Operatör", "Mağaza", "Zaman"]}>{items.map(item => <tr key={item.id}><td>{item.action}</td><td><code>{item.operatorId || item.actorId || "Bilinmiyor"}</code></td><td>{item.storeId ? <Link className="platform-text-link" href={`/stores/${encodeURIComponent(item.storeId)}`}>{item.storeId}</Link> : "Platform"}</td><td>{dateTime(item.createdAt || item.occurredAt)}</td></tr>)}</Table> : <Empty title="Henüz işlem geçmişi yok">Platform değişiklikleri gerçek operatör kimliğiyle burada görünür.</Empty>;
}

export function SettingsScreen({ operator }: { operator: { email: string; label: string; operatorId: string } }) {
  const now = useSupportClock();
  const audit = usePlatformResource<Envelope<Audit>>("/api/platform/audit");
  const sessions = usePlatformResource<Envelope<SupportSession>>("/api/platform/support-sessions");
  const [command, setCommand] = useState<CommandSpec | null>(null);
  const [query, setQuery] = useState("");
  const filteredAudit = audit.data?.items?.filter(item => `${item.action} ${item.operatorId || item.actorId || ""} ${item.storeId || ""}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))) || [];
  return <Screen title="Ayarlar ve Geçmiş" description="Platform erişimi, destek oturumları ve operatör işlem kayıtları.">
    <Panel title="Operatör erişimi"><KeyValues items={[["Operatör", operator.label], ["E-posta", operator.email], ["Kimlik", <code key="operator">{operator.operatorId}</code>], ["Doğrulama", "İki adımlı doğrulama (TOTP)"]]} /><Link href="/security" className="platform-button">Güvenlik ayarları</Link></Panel>
    <Panel title="Bağlantı durumları"><KeyValues items={[["Operatör doğrulaması", "Doğrulanmış giriş ve TOTP"], ["Ortak işlem kayıtları", audit.stale ? "Son bilinen veri" : audit.data ? "Erişilebilir" : audit.loading ? "Kontrol ediliyor…" : "Ulaşılamadı"], ["İşlem kaydı son kontrolü", dateTime(audit.data?.observedAt)], ["Destek oturum kayıtları", sessions.stale ? "Son bilinen veri" : sessions.data ? "Erişilebilir" : sessions.loading ? "Kontrol ediliyor…" : "Ulaşılamadı"], ["Destek kaydı son kontrolü", dateTime(sessions.data?.observedAt)]]} /></Panel>
    <Panel title="Destek oturumları"><ResourceStatus resource={sessions} />{sessions.data?.items?.length ? <Table headings={["Mağaza / yönetim alanı", "Operatör", "Gerekçe", "Bitiş", "Durum", ""]}>{sessions.data.items.map(session => <tr key={session.id}><td><Link href={`/stores/${encodeURIComponent(session.storeId)}`} className="platform-text-link">{session.storeId}</Link><small className="platform-cell-note">{session.adminHost}</small></td><td>{session.operatorLabel}</td><td>{session.reason}</td><td>{dateTime(session.expiresAt)}</td><td><Badge value={supportStatus(session, now)} /></td><td><Button disabled={sessions.stale || supportStatus(session, now) !== "active"} onClick={() => setCommand(revokeSupportCommand(session))}>İptal et</Button></td></tr>)}</Table> : sessions.data && <Empty title="Destek oturumu yok">Mağaza detayından gerekçeli, süreli destek erişimi açabilirsiniz.</Empty>}</Panel>
    <Panel title="Platform işlem geçmişi"><ResourceStatus resource={audit} /><label className="platform-field"><span>Son işlem kayıtlarında ara</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="İşlem, operatör veya mağaza" /></label>{audit.data && <AuditTable items={filteredAudit} />}</Panel>
    <CommandDialog command={command} onClose={() => setCommand(null)} onCommitted={() => { void sessions.refresh(); void audit.refresh(); }} onRefresh={async () => { const data = await sessions.refresh(); const sessionId = command?.payload({}).sessionId; return data?.items?.find(session => session.id === sessionId)?.version; }} />
  </Screen>;
}
