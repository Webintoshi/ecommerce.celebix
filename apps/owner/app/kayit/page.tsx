import process from 'node:process';
import type {Metadata} from 'next';
import {resolveSelfServeRegistrationUiEnabled} from '@/lib/self-serve-registration-orchestrator';
import {SelfServeDirectRegistrationForm} from '@/components/self-serve/SelfServeDirectRegistrationForm';
import styles from './signup.module.css';
export const metadata:Metadata={title:'Mağazanızı açın | Celebix',description:'Telefonunuzu doğrulayın, Celebix ile mağazanızı oluşturun.'};
export default function KayitPage() {
 const enabled=resolveSelfServeRegistrationUiEnabled(process.env);
 let merchantLoginHref:string|null=null;
 try {const value=process.env.CELEBIX_PANEL_ORIGIN;if(value){const origin=new URL(value);if(origin.protocol==='https:'&&origin.origin===value&&!origin.port&&!origin.username&&!origin.password&&origin.hostname.includes('.'))merchantLoginHref=value+'/login';}}catch{/* Missing authority never becomes a guessed login destination. */}
 return <main className={styles.page}>
  <header className={styles.header}>
   <a href="https://celebix.net/tr" aria-label="Celebix ana sayfa"><img src="/branding/celebix-logo.svg" alt="Celebix" width="146" height="40"/></a>
   {merchantLoginHref&&<a className={styles.login} href={merchantLoginHref}><span>Hesabınız var mı?</span> <strong>Giriş yap</strong></a>}
  </header>
  <section className={styles.formArea} aria-labelledby="signup-title" data-state={enabled?'enabled':'disabled'}>
   <h1 id="signup-title">Mağazanızı açın.</h1>
   <SelfServeDirectRegistrationForm enabled={enabled} domainSuffix={enabled?process.env.CELEBIX_PLATFORM_DOMAIN_SUFFIX:undefined}/>
   {!enabled&&<p className={styles.unavailable} role="status">Mağaza kaydı şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.</p>}
  </section>
  <aside className={styles.scene} aria-label="Markanızın yeni başlangıcı">
   <picture><source media="(max-width:767px)" srcSet="/branding/signup/entrepreneurs-720.webp"/><img src="/branding/signup/entrepreneurs-1448.webp" width="1448" height="1086" alt="Güneşli bir mağaza atölyesinde siparişlerini birlikte hazırlayan üç girişimci" fetchPriority="high" decoding="async"/></picture>
   <p>Sıra sizin markanızda.</p>
  </aside>
  <nav className={styles.footer} aria-label="Celebix bağlantıları"><a href="https://celebix.net/tr/gizlilik" target="_blank" rel="noreferrer">Gizlilik</a><a href="https://celebix.net/tr/kullanim-kosullari" target="_blank" rel="noreferrer">Kullanım şartları</a><a href="https://celebix.net/tr/iletisim" target="_blank" rel="noreferrer">Destek</a></nav>
 </main>;
}
