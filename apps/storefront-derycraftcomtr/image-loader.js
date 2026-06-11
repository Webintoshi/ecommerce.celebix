'use client';

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function resolveLoaderSource(src) {
  if (!src || typeof src !== 'string') {
    return src;
  }

  if (!src.startsWith('/api/assets')) {
    return src;
  }

  try {
    const parsedUrl = new URL(src, 'https://celebix.local');
    const upstream = parsedUrl.searchParams.get('src');
    return upstream?.trim() || src;
  } catch {
    return src;
  }
}

export default function imageLoader({ src, width, quality }) {
  if (!src) {
    return src;
  }

  const loaderSource = resolveLoaderSource(src);
  const transformationUrl = trimTrailingSlash(
    process.env.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL || '',
  );
  const baseUrl = trimTrailingSlash(process.env.NEXT_PUBLIC_SITE_URL || '');
  const query = new URLSearchParams();

  if (width) {
    query.set('width', String(width));
  }

  if (quality) {
    query.set('quality', String(quality));
  }

  if (!transformationUrl) {
    return src;
  }

  if (!isAbsoluteUrl(loaderSource)) {
    if (process.env.NODE_ENV === 'development' || !baseUrl) {
      return src;
    }

    return `${transformationUrl}/image/${baseUrl}${loaderSource}?${query.toString()}`;
  }

  return `${transformationUrl}/image/${loaderSource}?${query.toString()}`;
}
