export default function PromotionalBannersPreload() {
  // Default banner images for preloading
  // These are the fallback images used when no custom banners are set
  const defaultImages = [
    { href: "/hero-banner-fistik-ezmeleri.jpg", type: "image/jpeg" },
    { href: "/Hero_banner_Bir.jpg", type: "image/jpeg" },
    { href: "/Findik_Ezmeleri_Kategorisi.webp", type: "image/webp" },
  ];

  // Mobile versions
  const mobileImages = [
    { href: "/hero-banner-fistik-ezmeleri-mobile.jpg", type: "image/jpeg" },
    { href: "/Hero_banner_Bir-mobile.jpg", type: "image/jpeg" },
    { href: "/Findik_Ezmeleri_Kategorisi-mobile.webp", type: "image/webp" },
  ];

  return (
    <>
      {/* Preload desktop images */}
      {defaultImages.map((img, index) => (
        <link
          key={`desktop-${index}`}
          rel="preload"
          href={img.href}
          as="image"
          type={img.type}
          media="(min-width: 768px)"
        />
      ))}
      
      {/* Preload mobile images */}
      {mobileImages.map((img, index) => (
        <link
          key={`mobile-${index}`}
          rel="preload"
          href={img.href}
          as="image"
          type={img.type}
          media="(max-width: 767px)"
        />
      ))}
    </>
  );
}
