"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, Send, Youtube } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { useStoreInfo } from "@/lib/store-info-context";
import { fetchCategories } from "@/lib/categories";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

type FooterCategory = {
  id: string;
  name: string;
  slug: string;
};

export function Footer() {
  const { storeInfo } = useStoreInfo();
  const [email, setEmail] = useState("");
  const [categoryLinks, setCategoryLinks] = useState<FooterCategory[]>([]);
  const currentYear = new Date().getFullYear();
  const logoSrc = resolveStorefrontAssetUrl(storeInfo?.logoUrl || "");
  const logoAlt = storeInfo?.name || SITE_NAME;
  const usesProxiedLogo = isProxiedStorefrontAssetUrl(logoSrc);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      try {
        const categories = await fetchCategories();
        if (!isMounted) {
          return;
        }

        const topLevelCategories = categories
          .filter((category) => !category.parent_id && category.is_active !== false && category.slug)
          .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0))
          .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
          }));

        setCategoryLinks(topLevelCategories);
      } catch (error) {
        console.error("Failed to load footer categories:", error);
      }
    };

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubscribe = (event: React.FormEvent) => {
    event.preventDefault();
    console.log("Subscribe:", email);
    setEmail("");
  };

  const blogLinks = [
    { name: "Blog", href: "/blog" },
    { name: "İletişim", href: "/iletisim" },
    { name: "Garanti ve İade", href: "/iade" },
    { name: "Ödeme ve Teslimat", href: "/kargo" },
    { name: "E-bültene Kaydol", href: "#" },
    { name: "Sitemap", href: "/sitemap.xml" },
  ];

  const corporateLinks = [
    { name: "Hakkımızda", href: "/hakkimizda" },
    { name: "Kurumsal Ürünler", href: "/kurumsal-urunler" },
    { name: "Aydınlatma Metni ve Gizlilik Politikası", href: "/gizlilik" },
    { name: "Taklit ve Dolandırıcılık İhbarı", href: "#" },
    { name: "Hizmet Şartları", href: "/sartlar" },
    { name: "Ekibe Katıl", href: "#" },
  ];

  return (
    <footer className="bg-[#0a1628] text-white">
      <div className="container-premium py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-3">
            <Link href="/" className="mb-6 inline-block">
              {logoSrc ? (
                <div className="relative h-10 w-[150px]">
                  <Image
                    src={logoSrc}
                    alt={logoAlt}
                    fill
                    className="object-contain object-left brightness-0 invert"
                    sizes="150px"
                    unoptimized={usesProxiedLogo}
                  />
                </div>
              ) : (
                <span className="font-serif text-xl font-medium">{logoAlt}</span>
              )}
            </Link>

            <h3 className="mb-4 text-xs uppercase tracking-[0.3em] text-white/80">2016'DAN BERİ</h3>
            <p className="text-sm italic leading-relaxed text-white/70">
              Modern dünya insanları için geleneksel el işçiliği ile yüksek kalitede, kullanışlı ve
              tarz deri ürünler üretiyoruz.
            </p>
          </div>

          <div className="lg:col-span-2 lg:col-start-4">
            <h3 className="mb-4 text-xs uppercase tracking-[0.3em] text-white/80">KATEGORİLER</h3>
            <ul className="space-y-3">
              {categoryLinks.map((link) => (
                <li key={link.id}>
                  <Link href={`/${link.slug}`} className="text-sm text-white/70 transition-colors hover:text-white">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <ul className="space-y-3">
              {blogLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-white/70 transition-colors hover:text-white">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <ul className="space-y-3">
              {corporateLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href} className="text-sm text-white/70 transition-colors hover:text-white">
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h3 className="mb-4 text-xs uppercase tracking-[0.3em] text-white/80">BİZİ TAKİP ET</h3>
            <p className="mb-6 text-sm text-white/70">
              E-bültene katılarak gelişmelerden ve kampanyalardan anında haberdar ol.
            </p>

            <form onSubmit={handleSubscribe} className="mb-8">
              <div className="relative border-b border-white/30 transition-colors focus-within:border-white/60">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="E-posta adresini gir"
                  className="w-full bg-transparent py-2 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white/60 transition-colors hover:text-white"
                  aria-label="Abone ol"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 transition-colors hover:text-white"
                aria-label="Instagram"
              >
                <Instagram className="h-6 w-6" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 transition-colors hover:text-white"
                aria-label="Facebook"
              >
                <Facebook className="h-6 w-6" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 transition-colors hover:text-white"
                aria-label="YouTube"
              >
                <Youtube className="h-6 w-6" />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-premium py-6">
          <p className="text-center text-sm text-white/40">
            © {currentYear} {storeInfo?.name || SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
