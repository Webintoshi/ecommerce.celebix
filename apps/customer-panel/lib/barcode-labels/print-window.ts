export function reservePrintWindow(
  openWindow: () => Window | null = () => window.open("", "_blank"),
): Window | null {
  const reserved = openWindow();
  if (reserved) reserved.opener = null;
  return reserved;
}

export function completePrintWindow(
  reserved: Window | null,
  url: string,
  fallback: (url: string) => void = (target) => window.location.assign(target),
) {
  if (reserved) reserved.location.replace(url);
  else fallback(url);
}

export function cancelPrintWindow(reserved: Window | null) {
  reserved?.close();
}
