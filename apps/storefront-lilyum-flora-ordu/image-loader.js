'use client';

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

export default function imageLoader({ src, width, quality }) {
  if (!src) {
    return src;
  }

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

  if (!isAbsoluteUrl(src)) {
    if (process.env.NODE_ENV === 'development' || !baseUrl) {
      return src;
    }

    return `${transformationUrl}/image/${baseUrl}${src}?${query.toString()}`;
  }

  return `${transformationUrl}/image/${src}?${query.toString()}`;
}
