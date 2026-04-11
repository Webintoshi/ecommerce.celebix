export type EmailMarketingTemplateId =
  | "welcome"
  | "special-offer"
  | "new-product"
  | "order-reminder";

export interface EmailMarketingTemplate {
  id: EmailMarketingTemplateId;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  updatedAt?: string;
}

export interface EmailMarketingSettings {
  templates: EmailMarketingTemplate[];
}

export interface EmailMarketingRecipient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
  acceptsEmailMarketing: boolean;
  createdAt: string;
}
