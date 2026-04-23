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
  channels: FloatingContactChannel[];
}

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
  channels: DEFAULT_FLOATING_CONTACT_CHANNELS.map((channel) => ({ ...channel })),
};

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
