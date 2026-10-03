import styles from "./shared-footer-signature.module.css";

export function SharedFooterSignature() {
  return <div className={styles.row} data-footer-signature="celebix">
    <a className={styles.link} href="https://celebix.net/tr/e-ticaret-paketleri" aria-label="Celebix e-ticaret altyapısı">
      <img className={styles.logo} src="/brand/celebix-dark.svg" alt="Celebix" width={2000} height={878} loading="lazy" decoding="async" />
    </a>
  </div>;
}
