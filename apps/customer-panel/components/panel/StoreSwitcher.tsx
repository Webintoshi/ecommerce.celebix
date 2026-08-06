import { ArrowRightLeft } from "lucide-react";

import type { PanelClientStoreOption } from "@/lib/panel-ui/client-chrome-model";
import styles from "./panel-shell.module.css";

export function StoreSwitcher({ stores, activeStoreSelectionKey }: {
  stores: readonly PanelClientStoreOption[];
  activeStoreSelectionKey: string;
}) {
  if (stores.length < 2) return null;
  const active = stores.find((store) => store.selectionKey === activeStoreSelectionKey);
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
          <select name="destinationStoreId" defaultValue={activeStoreSelectionKey} required>
            {stores.map((store) => (
              <option key={store.selectionKey} value={store.selectionKey}>{store.displayName}</option>
            ))}
          </select>
        </label>
        <button type="submit">Mağazaya geç</button>
      </form>
    </details>
  );
}
