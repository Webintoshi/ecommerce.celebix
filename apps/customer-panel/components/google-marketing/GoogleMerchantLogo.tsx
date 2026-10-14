/** Public Google product mark; see public/brands/google-merchant.source.txt. */
export function GoogleMerchantLogo({ className }: Readonly<{ className?: string }>) {
  // The local SVG keeps connection screens free of third-party asset requests.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brands/google-merchant.svg" width={64} height={64} alt="" aria-hidden="true" className={className} />;
}
