import type { EmailConfig, NotificationSettings } from "../types/notification";

export const STORED_SECRET = "••••••••";

export function redactStoredSecret<T extends string | undefined>(value: T): T | typeof STORED_SECRET {
    return value ? STORED_SECRET : value;
}

export function restoreStoredSecret<T extends string | undefined>(
    value: T,
    stored: T,
): T {
    return value === STORED_SECRET ? stored : value;
}

export function redactSecretFields(fields: Record<string, string>, keys: string[]) {
    return {
        ...fields,
        ...Object.fromEntries(keys.map((key) => [key, redactStoredSecret(fields[key]) ?? ""])),
    };
}

export function restoreSecretFields(
    fields: Record<string, string>,
    stored: Record<string, string> | undefined,
    keys: string[],
) {
    return {
        ...fields,
        ...Object.fromEntries(keys.map((key) => [key, restoreStoredSecret(fields[key], stored?.[key]) ?? ""])),
    };
}

export function redactEmailSettings(email: EmailConfig): EmailConfig {
    return { ...email, apiKey: redactStoredSecret(email.apiKey), password: redactStoredSecret(email.password) };
}

export function restoreEmailSettings(email: EmailConfig, current: EmailConfig): EmailConfig {
    const stored = email.provider === current.provider ? current : undefined;
    return {
        ...email,
        apiKey: restoreStoredSecret(email.apiKey, stored?.apiKey),
        password: restoreStoredSecret(email.password, stored?.password),
    };
}

export function redactNotificationSettings(settings: NotificationSettings): NotificationSettings {
    return {
        email: redactEmailSettings(settings.email),
        sms: {
            ...settings.sms,
            apiKey: redactStoredSecret(settings.sms.apiKey),
            apiSecret: redactStoredSecret(settings.sms.apiSecret),
        },
        push: { ...settings.push, apiKey: redactStoredSecret(settings.push.apiKey) },
    };
}

export function restoreNotificationSettings(settings: NotificationSettings, current: NotificationSettings): NotificationSettings {
    const storedSms = settings.sms.provider === current.sms.provider ? current.sms : undefined;
    return {
        email: restoreEmailSettings(settings.email, current.email),
        sms: {
            ...settings.sms,
            apiKey: restoreStoredSecret(settings.sms.apiKey, storedSms?.apiKey) ?? "",
            apiSecret: restoreStoredSecret(settings.sms.apiSecret, storedSms?.apiSecret),
        },
        push: {
            ...settings.push,
            apiKey: restoreStoredSecret(settings.push.apiKey, current.push.apiKey) ?? "",
        },
    };
}
