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

      <div className="status-grid">
        {clients.map((client) => (
          <Link key={client.id} href={`/stores/${client.slug}`} className="status-card">
            <div className="status-card-top">
              <strong>{client.clientCompanyName}</strong>
              <span className={`pill ${client.health.label === "hazir" ? "pill-success" : "pill-accent"}`}>{client.lifecycleStage}</span>
            </div>
            <p>{client.nextAction || "Siradaki aksiyon tanimlanmamis."}</p>
            <div className="meta-pairs">
              <span>Magaza: {client.storeName}</span>
              <span>Ic sorumlu: {client.internalOwner || "Atanmadi"}</span>
              <span>Iletisim: {client.clientContactName || client.clientContactEmail || "-"}</span>
              <span>Ciro: {formatCurrency(client.totalRevenue)}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
