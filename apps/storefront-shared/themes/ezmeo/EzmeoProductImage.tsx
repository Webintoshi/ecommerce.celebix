import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { isEzmeoProductImageSource } from "./product-image-source.ts";

type Props = Readonly<{
  media: { url: string; width?: number; height?: number };
  alt: string;
  sizes: string;
  className?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
}>;

export function EzmeoProductImage({
  media, alt, sizes, className, loading = "lazy", fetchPriority, decoding,
}: Props) {
  const { url, width, height } = media;
  const optimize = isEzmeoProductImageSource(url);
  const { src, srcSet } = optimize
    ? getImageProps({ src: url, alt, width: width || 1, height: height || 1, sizes }).props
    : { src: url, srcSet: undefined };

  // The original is also the fallback for temporarily unavailable resized images.
  return <img
    key={url}
    alt={alt}
    className={className}
    width={width}
    height={height}
    loading={loading}
    decoding={decoding ?? (optimize ? "async" : undefined)}
    fetchPriority={optimize || loading === "eager" ? fetchPriority : undefined}
    sizes={srcSet ? sizes : undefined}
    srcSet={srcSet}
    src={src}
    onError={optimize ? ({ currentTarget }) => {
      if (!currentTarget.hasAttribute("srcset")) return;
      currentTarget.removeAttribute("srcset");
      currentTarget.removeAttribute("sizes");
      currentTarget.src = url;
    } : undefined}
  />;
}
