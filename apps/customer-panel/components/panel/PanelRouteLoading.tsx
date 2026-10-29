import styles from "./panel-route-loading.module.css";

export function PanelRouteLoading() {
  return (
    <div className={styles.loading} role="status">
      <img
        className={styles.mark}
        src="/brand/celebix-manyetik.svg"
        width={96}
        height={96}
        alt=""
        aria-hidden="true"
      />
      <span className={styles.srOnly}>Sayfa yükleniyor</span>
    </div>
  );
}
