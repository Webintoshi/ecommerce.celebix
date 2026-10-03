"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CommandDialog } from "./CommandDialog";
import { usePlatformResource } from "./resource";
import type { CommandSpec, Envelope, Operation, Operations, Store } from "./types";
import { Badge, Button, count, dateTime, Empty, Panel, ResourceStatus, Screen, Table } from "./ui";

export function OperationsScreen() {
  const operations = usePlatformResource<Operations>("/api/platform/operations");
  const stores = usePlatformResource<Envelope<Store>>("/api/platform/stores");
  const storeMap = useMemo(() => new Map(stores.data?.items?.map(store => [store.id, store.name])), [stores.data]);
  const [command, setCommand] = useState<CommandSpec | null>(null);
  function retry(operation: Operation) {
    if (!operation.retryable || operation.version === undefined) return;
    setCommand({ title: "Kurulum işini yeniden sıraya al", description: "Desteklenen kurulum işi mevcut kaydı üzerinden yeniden sıraya alınır. İşlem operatör geçmişine kaydedilir.", endpoint: "/api/platform/operations", action: "operations.retry", expectedVersion: operation.version, resourceId: operation.jobId || operation.id, initial: {}, fields: [], payload: () => ({ jobId: operation.jobId || operation.id }) });
  }
  return <Screen title="Operasyonlar" description="Ortak mağaza kurulumlarının son durumunu ve işlem geçmişini izleyin.">
    <ResourceStatus resource={operations} />
    <div className="platform-notice"><p>Yeniden deneme yalnızca sunucunun güvenli olarak işaretlediği kurulum kayıtlarında kullanılabilir.</p></div>
    <Panel title="Son kurulum işlemleri">{operations.data?.items?.length ? <Table headings={["İşlem", "Mağaza", "Durum", "Deneme", "Son değişiklik", ""]}>{operations.data.items.map(operation => <tr key={operation.id}><td><code>{operation.id}</code>{operation.safeCode && <small className="platform-cell-note">{operation.safeCode}</small>}</td><td>{operation.storeId ? <Link className="platform-text-link" href={`/stores/${encodeURIComponent(operation.storeId)}`}>{storeMap.get(operation.storeId) || operation.storeId}</Link> : "Mağaza henüz oluşmadı"}</td><td><Badge value={operation.state || operation.status} /></td><td>{count(operation.retryCount)}</td><td>{dateTime(operation.updatedAt)}</td><td>{operation.retryable && operation.version !== undefined ? <Button disabled={operations.stale} onClick={() => retry(operation)}>Yeniden sıraya al</Button> : "Yeniden deneme desteklenmiyor"}</td></tr>)}</Table> : operations.data && <Empty title="Henüz operasyon kaydı yok">Ortak kurulum akışındaki işlemler burada görünür.</Empty>}</Panel>
    <Panel title="Kurulum çalışanları">{operations.data?.workers?.length ? <Table headings={["Kurulum sunucusu", "Yönetim sunucusu", "Son kontrol", "Durum"]}>{operations.data.workers.map(worker => <tr key={`${worker.ownerOrigin}-${worker.panelOrigin}`}><td>{worker.ownerOrigin}</td><td>{worker.panelOrigin}</td><td>{dateTime(worker.lastCheckedAt)}</td><td><Badge value={worker.state} /></td></tr>)}</Table> : operations.data && <Empty title="Çalışan kontrol kaydı yok">Henüz güncel sağlık kontrolü alınmadı.</Empty>}</Panel>
    <Panel title="Kontrol bekleyen alan adları">{operations.data?.domainIssues?.length ? <Table headings={["Mağaza", "Alan adı", "Durum"]}>{operations.data.domainIssues.map(domain => <tr key={`${domain.storeId}-${domain.hostname}`}><td>{storeMap.get(domain.storeId) || domain.storeId}</td><td>{domain.hostname}</td><td><Badge value={domain.status} /></td></tr>)}</Table> : operations.data && <Empty title="Kontrol bekleyen alan adı yok" />}</Panel>
    <CommandDialog command={command} onClose={() => setCommand(null)} onCommitted={() => void operations.refresh()} onRefresh={async () => { const result = await operations.refresh(); return result?.items?.find(item => (item.jobId || item.id) === command?.resourceId)?.version; }} />
  </Screen>;
}
