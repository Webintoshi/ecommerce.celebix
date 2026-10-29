"use client";

import { useState, type ReactNode } from "react";
import styles from "../retail-footer.module.css";

type Tone = "light" | "dark";

export function FooterSection({ tone, intro, navigation, contact, social, signature, alternateSignature, copyright }: Readonly<{
  tone: Tone;
  intro: ReactNode;
  navigation?: ReactNode;
  contact: ReactNode;
  social?: ReactNode;
  signature?: ReactNode;
  alternateSignature?: ReactNode;
  copyright: ReactNode;
}>) {
  const [override, setOverride] = useState<Tone | null>(null);
  const currentTone = override ?? tone;
  return <footer className={`store-footer retail-footer ${styles.root}`} data-footer-tone={currentTone} data-footer-section>
    <div className={`store-container ${styles.main}`}>
      <div className={styles.intro}>{intro}</div>
      {navigation ? <div className={styles.navigation}>{navigation}</div> : null}
      <section className={styles.contact} aria-label="İletişim"><h2>İletişim</h2>{contact}</section>
      <section className={styles.follow} aria-label="Sosyal medya ve görünüm">
        {social ? <><h2>Bizi takip edin</h2>{social}</> : null}
        <div className={styles.appearance}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
          <button className={styles.toggle} type="button" role="switch" aria-label="Koyu görünüm" aria-checked={currentTone === "dark"} onClick={() => setOverride(currentTone === "dark" ? "light" : "dark")}><span /></button>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" /></svg>
        </div>
      </section>
    </div>
    <div className={`store-container ${styles.bottom}`}>
      <small>{copyright}</small>
      <div className={styles.branding}>{currentTone === tone ? signature : alternateSignature}</div>
    </div>
  </footer>;
}
