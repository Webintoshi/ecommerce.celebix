import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";
import { requireOwnerAuth } from "@/lib/owner-auth";
import { listClientAccounts } from "@/lib/control-plane";

export default async function ClientsPage() {
  const auth = await requireOwnerAuth("/clients");
  const clients = await listClientAccounts(auth);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Musteriler</h1>
          <p>Marka sahibi, ic sorumlu, sonraki aksiyon ve teslimat takibini tek CRM gorunumuyle yonet.</p>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>Henüz Müşteri Yok</h3>
            <p>Müşteriler projelerle birlikte otomatik olarak listelenecektir.</p>
          </div>
        </div>
      ) : (
        <div className="status-grid">
          {clients.map((client) => (
            <Link key={client.id} href={`/stores/${client.slug}`} className="status-card">
              <div className="status-card-top">
                <strong>{client.clientCompanyName}</strong>
                <span className={`pill ${client.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>
                  {client.lifecycleStage}
                </span>
              </div>
              <p>{client.nextAction || "Siradaki aksiyon tanimlanmamis."}</p>
              <div className="meta-pairs meta-pairs-compact">
                <span>Magaza: <strong>{client.storeName}</strong></span>
                <span>Ic sorumlu: <strong>{client.internalOwner || "Atanmadi"}</strong></span>
                <span>Iletisim: <strong>{client.clientContactName || client.clientContactEmail || "-"}</strong></span>
                <span>Ciro: <strong>{formatCurrency(client.totalRevenue)}</strong></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
