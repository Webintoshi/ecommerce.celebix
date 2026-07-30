import { ArrowRightLeft } from "lucide-react";

import type { PanelStoreOption } from "@/lib/panel-store-options/postgres-repository";
import styles from "./panel-shell.module.css";

export function StoreSwitcher({ stores, activeStoreId }: {
  stores: readonly PanelStoreOption[];
  activeStoreId: string;
}) {
  if (stores.length < 2) return null;
  const active = stores.find((store) => store.storeId === activeStoreId);
  if (!active) return null;

  return (
    <details className={styles.storeSwitcher}>
      <summary aria-label="Yönetilen mağazayı değiştir">
        <ArrowRightLeft aria-hidden="true" />
        <span><small>Yönetilen mağaza</small><strong>{active.displayName}</strong></span>
      </summary>
      <form action="/api/session/switch" method="post">
        <label>
          <span>Geçiş yapılacak mağaza</span>
          <select name="destinationStoreId" defaultValue={activeStoreId} required>
            {stores.map((store) => (
              <option key={store.storeId} value={store.storeId}>{store.displayName}</option>
            ))}
          </select>
        </label>
        <button type="submit">Mağazaya geç</button>
      </form>
    </details>
  );
}
