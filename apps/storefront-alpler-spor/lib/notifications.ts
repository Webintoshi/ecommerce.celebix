import { NotificationSettings, EmailConfig, SMSConfig } from "@/types/notification";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

// Mock initial data
const defaultSettings: NotificationSettings = {
    email: {
        provider: "smtp",
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: "user@example.com",
        password: "",
        senderName: STOREFRONT_RUNTIME.name,
        senderEmail: STOREFRONT_RUNTIME.supportEmail,
    },
    sms: {
        provider: "netgsm",
        apiKey: "",
        apiSecret: "",
        senderTitle: STOREFRONT_RUNTIME.name.replace(/\s+/g, " ").slice(0, 11).toUpperCase(),
    },
    push: {
        provider: "firebase",
        apiKey: "",
        authDomain: "",
        projectId: "",
        storageBucket: "",
        messagingSenderId: "",
        appId: "",
    },
};

let currentSettings = { ...defaultSettings };

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    return currentSettings;
};

export const updateNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    currentSettings = settings;
    // In a real app, this would persist to DB
};

export const testEmailConnection = async (config: EmailConfig): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Simulate success if host/apiKey is present
    if (config.provider === "smtp") return !!config.host;
    return !!config.apiKey;
};

export const testSMSConnection = async (config: SMSConfig): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return !!config.apiKey;
};
