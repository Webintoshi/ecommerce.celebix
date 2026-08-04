import Link from "next/link";

export function AccountNav() { return <nav className="account-nav" aria-label="Hesap bölümleri"><Link href="/account">Özet</Link><Link href="/account/orders">Siparişler</Link><Link href="/account/addresses">Adresler</Link><Link href="/account/profile">Profil</Link><Link href="/account/security">Güvenlik</Link></nav>; }
