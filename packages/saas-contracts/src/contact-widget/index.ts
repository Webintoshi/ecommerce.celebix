export { CONTACT_WIDGET_CHANNEL_TYPES, CONTACT_WIDGET_PAGE_TYPES, createDefaultContactWidgetConfig, parseContactWidgetConfig, normalizeContactWidgetChannelValue, isValidContactWidgetChannelValue } from "./config.ts";
export type { ContactWidgetConfig, ContactWidgetChannel, ContactWidgetChannelType, ContactWidgetPageType } from "./config.ts";
export { resolveContactWidgetHref, contactWidgetPageType, contactWidgetAvailability, shouldShowContactWidget } from "./behavior.ts";
export type { ContactWidgetProductContext } from "./behavior.ts";
