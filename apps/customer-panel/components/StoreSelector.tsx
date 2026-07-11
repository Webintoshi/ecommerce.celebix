interface StoreOption {
  id: string;
  name: string;
}

export function StoreSelector({
  stores,
  activeStoreId,
}: {
  stores: readonly StoreOption[];
  activeStoreId?: string;
}) {
  return (
    <form className="store-selector" action="/api/session/active-store" method="post">
      <label htmlFor="active-store">Aktif mağaza</label>
      <select id="active-store" name="storeId" defaultValue={activeStoreId} disabled={stores.length === 0}>
        {stores.length === 0 ? <option>Mağaza bulunamadı</option> : null}
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={stores.length === 0}>Değiştir</button>
    </form>
  );
}
