import { NotificationSettings, EmailConfig, SMSConfig } from "@/types/notification";

// Mock initial data
const defaultSettings: NotificationSettings = {
    email: {
        provider: "smtp",
        host: "smtp.example.com",
        port: 587,
        secure: false,
        user: "user@example.com",
        password: "",
        senderName: "Ornek Magaza",
        senderEmail: "noreply@ornek-magaza.celebix.co",
    },
    sms: {
        provider: "netgsm",
        apiKey: "",
        apiSecret: "",
        senderTitle: "ORNEK MAGAZA",
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
