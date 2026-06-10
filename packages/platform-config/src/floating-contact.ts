export type FloatingContactChannelType = "whatsapp" | "instagram" | "form";

export type FloatingContactPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export interface FloatingContactChannel {
  type: FloatingContactChannelType;
  enabled: boolean;
  label: string;
  href: string;
}

export interface FloatingContactSettings {
  enabled: boolean;
  position: FloatingContactPosition;
  buttonColor: string;
  channels: FloatingContactChannel[];
}

export const DEFAULT_FLOATING_CONTACT_BUTTON_COLOR = "#12100D";

const DEFAULT_FLOATING_CONTACT_CHANNELS: FloatingContactChannel[] = [
  {
    type: "whatsapp",
    enabled: false,
    label: "WhatsApp",
    href: "",
  },
  {
    type: "instagram",
    enabled: false,
    label: "Instagram",
    href: "",
  },
  {
    type: "form",
    enabled: false,
    label: "Form",
    href: "",
  },
];

export const DEFAULT_FLOATING_CONTACT_SETTINGS: FloatingContactSettings = {
  enabled: false,
  position: "bottom-right",
  buttonColor: DEFAULT_FLOATING_CONTACT_BUTTON_COLOR,
  channels: DEFAULT_FLOATING_CONTACT_CHANNELS.map((channel) => ({ ...channel })),
};

export function normalizeFloatingContactButtonColor(value?: string | null): string {
  const normalized = (value || "").trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toUpperCase();
  }

  return DEFAULT_FLOATING_CONTACT_BUTTON_COLOR;
}

export function getFloatingContactButtonHoverColor(hexColor: string): string {
  const color = normalizeFloatingContactButtonColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  const factor = 0.88;
  const toHex = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * factor)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
}

export function getFloatingContactButtonShadowRgba(hexColor: string, alpha = 0.42): string {
  const color = normalizeFloatingContactButtonColor(hexColor);
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getFloatingContactDefaultLabel(type: FloatingContactChannelType): string {
  switch (type) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "form":
      return "Form";
    default:
      return "Iletisim";
  }
}

export function normalizeFloatingContactSettings(
  value?: Partial<FloatingContactSettings> | null
): FloatingContactSettings {
  const position =
    value?.position && isFloatingContactPosition(value.position)
      ? value.position
      : DEFAULT_FLOATING_CONTACT_SETTINGS.position;

  const channelMap = new Map<FloatingContactChannelType, Partial<FloatingContactChannel>>();

  for (const channel of Array.isArray(value?.channels) ? value.channels : []) {
    if (channel?.type && isFloatingContactChannelType(channel.type)) {
      channelMap.set(channel.type, channel);
    }
  }

  return {
    enabled: Boolean(value?.enabled),
    position,
    buttonColor: normalizeFloatingContactButtonColor(value?.buttonColor),
    channels: DEFAULT_FLOATING_CONTACT_CHANNELS.map((defaultChannel) => {
      const candidate = channelMap.get(defaultChannel.type);
      return {
        type: defaultChannel.type,
        enabled: Boolean(candidate?.enabled),
        label: typeof candidate?.label === "string" && candidate.label.trim().length > 0
          ? candidate.label.trim()
          : defaultChannel.label,
        href: typeof candidate?.href === "string" ? candidate.href.trim() : defaultChannel.href,
      };
    }),
  };
}

export function resolveFloatingContactHref(channel: FloatingContactChannel): string {
  const rawValue = channel.href.trim();
  if (!rawValue) {
    return "";
  }

  if (channel.type === "whatsapp") {
    if (/^https?:\/\//i.test(rawValue)) {
      return rawValue;
    }

    const digits = rawValue.replace(/[^\d]/g, "");
    return digits.length >= 7 ? `https://wa.me/${digits}` : rawValue;
  }

  if (channel.type === "instagram") {
    if (/^https?:\/\//i.test(rawValue)) {
      return rawValue;
    }

    const handle = rawValue.replace(/^@/, "");
    return handle ? `https://instagram.com/${handle}` : "";
  }

  if (/^https?:\/\//i.test(rawValue) || rawValue.startsWith("/")) {
    return rawValue;
  }

  return `/${rawValue.replace(/^\/+/, "")}`;
}

export function isFloatingContactExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function isFloatingContactPosition(value: string): value is FloatingContactPosition {
  return (
    value === "bottom-right" ||
    value === "bottom-left" ||
    value === "top-right" ||
    value === "top-left"
  );
}

function isFloatingContactChannelType(value: string): value is FloatingContactChannelType {
  return value === "whatsapp" || value === "instagram" || value === "form";
}
