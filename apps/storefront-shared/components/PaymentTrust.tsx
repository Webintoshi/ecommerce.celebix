import { SharedFooterSignature } from "./SharedFooterSignature";
import styles from "./payment-trust.module.css";

export function PaymentBrandMarks() {
  return <div className={styles.marks} data-payment-brand-marks>
    <img className={styles.band} src="/payment-marks/card-brands.svg" alt="Mastercard, Visa, American Express, TROY" width={324} height={48} loading="lazy" decoding="async" />
  </div>;
}

export function FooterPaymentBranding() {
  return <div className={styles.footer} data-footer-payment-branding>
    <PaymentBrandMarks />
    <SharedFooterSignature />
  </div>;
}

export function CheckoutPaymentSecurity({ cardPayment = false }: Readonly<{ cardPayment?: boolean }>) {
  return <div className={styles.security} role="group" aria-label="Ödeme güvenliği" data-checkout-payment-security>
    <div className={styles.badge}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg>
      <span><strong>SSL / TLS</strong><small>Şifreli bağlantı</small></span>
    </div>
    {cardPayment ? <div className={styles.badge} data-payment-three-d-secure>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
      <span><strong>3D Secure</strong><small>Banka doğrulaması</small></span>
    </div> : null}
  </div>;
}
