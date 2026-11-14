import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { optimizedProductImageStorefront } from "../lib/product-image-source.ts";

type Props = Readonly<{
  media: { url: string; width?: number; height?: number };
  alt: string;
  sizes: string;
  className?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
  draggable?: boolean;
}>;

export function ResponsiveProductImage({
  media, alt, sizes, className, loading = "lazy", fetchPriority, decoding, draggable,
}: Props) {
  const { url, width, height } = media;
  const optimize = Boolean(optimizedProductImageStorefront(url));
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
    draggable={draggable}
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
