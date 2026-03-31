export default function PromotionalBannersPreload() {
  const defaultImages = [
    { href: "/Hero_banner_Bir.webp", type: "image/webp" },
  ];

  const mobileImages = [
    { href: "/hero-banner-fistik-ezmeleri-mobile.webp", type: "image/webp" },
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
