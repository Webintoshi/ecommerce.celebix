import { extractPlainTextFromBlogContent, normalizeBlogHtmlContent } from "@celebix/platform-config/src/blog-rich-text";
import { buildStorefrontUrl, STORE_RUNTIME } from "@/lib/store-runtime";
import type {
  EmailMarketingRecipient,
  EmailMarketingSettings,
  EmailMarketingTemplate,
  EmailMarketingTemplateId,
} from "@/types/email-marketing";

const TEMPLATE_DEFINITIONS: Array<{
  id: EmailMarketingTemplateId;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
}> = [
  {
    id: "welcome",
    name: "Hos Geldiniz",
    description: "Yeni kayit olan musteriler icin karsilama e-postasi.",
    subject: `${STORE_RUNTIME.name}'a hos geldiniz`,
    bodyHtml: [
      `<p>Merhaba {firstName},</p>`,
      `<p>${STORE_RUNTIME.name} ailesine hos geldiniz. Yeni koleksiyonlari ve one cikan urunleri hemen inceleyebilirsiniz.</p>`,
      `<p><a href="${buildStorefrontUrl("/urunler")}">Urunleri incele</a></p>`,
      `<p>Sevgiler,<br />${STORE_RUNTIME.name} Ekibi</p>`,
    ].join(""),
  },
  {
    id: "special-offer",
    name: "Ozel Teklif",
    description: "Kampanya ve promosyon duyurulari icin duzenlenebilir teklif e-postasi.",
    subject: `{firstName}, size ozel bir teklifimiz var`,
    bodyHtml: [
      `<p>Merhaba {firstName},</p>`,
      `<p>Sizin icin ozel olarak hazirladigimiz kampanyayi kacirmayin. Secili urunlerde yeni bir avantaj sizi bekliyor.</p>`,
      `<p><a href="${buildStorefrontUrl("/urunler")}">Koleksiyonu ac</a></p>`,
      `<p>Sevgiler,<br />${STORE_RUNTIME.name} Ekibi</p>`,
    ].join(""),
  },
  {
    id: "new-product",
    name: "Yeni Urun",
    description: "Yeni koleksiyon veya urun lansmani duyurusu.",
    subject: `${STORE_RUNTIME.name} koleksiyonunda yeni urunler yayinda`,
    bodyHtml: [
      `<p>Merhaba {firstName},</p>`,
      `<p>Yeni urunlerimiz yayinda. Guncel koleksiyonu inceleyip magazadaki yeni secimleri ilk siz gorebilirsiniz.</p>`,
      `<p><a href="${buildStorefrontUrl("/urunler")}">Yeni urunleri gor</a></p>`,
      `<p>Sevgiler,<br />${STORE_RUNTIME.name} Ekibi</p>`,
    ].join(""),
  },
  {
    id: "order-reminder",
    name: "Siparis Hatirlatma",
    description: "Kararsiz ya da geri donmesini istediginiz musterilere hatirlatma mesaji.",
    subject: `{firstName}, seciminiz sizi bekliyor`,
    bodyHtml: [
      `<p>Merhaba {firstName},</p>`,
      `<p>Ilgilendiginiz urunler hala stokta olabilir. Geri donup siparisinizi tamamlamak icin magaza sayfasini tekrar ziyaret edebilirsiniz.</p>`,
      `<p><a href="${buildStorefrontUrl("/urunler")}">Magazaya don</a></p>`,
      `<p>Sevgiler,<br />${STORE_RUNTIME.name} Ekibi</p>`,
    ].join(""),
  },
];

function sanitizeTemplateHtml(value: string | undefined) {
  return normalizeBlogHtmlContent(value || "");
}

function mergeTemplate(
  templateId: EmailMarketingTemplateId,
  overrides?: Partial<EmailMarketingTemplate> | null,
): EmailMarketingTemplate {
  const base = TEMPLATE_DEFINITIONS.find((template) => template.id === templateId);

  if (!base) {
    throw new Error(`Unknown email template: ${templateId}`);
  }

  return {
    id: base.id,
    name: base.name,
    description: base.description,
    subject: typeof overrides?.subject === "string" && overrides.subject.trim()
      ? overrides.subject.trim()
      : base.subject,
    bodyHtml: sanitizeTemplateHtml(overrides?.bodyHtml || base.bodyHtml),
    updatedAt: typeof overrides?.updatedAt === "string" ? overrides.updatedAt : undefined,
  };
}

export function createDefaultEmailMarketingSettings(): EmailMarketingSettings {
  return {
    templates: TEMPLATE_DEFINITIONS.map((template) => mergeTemplate(template.id)),
  };
}

export function normalizeEmailMarketingSettings(
  value?: Partial<EmailMarketingSettings> | null,
): EmailMarketingSettings {
  const rawTemplates = Array.isArray(value?.templates) ? value.templates : [];

  return {
    templates: TEMPLATE_DEFINITIONS.map((template) =>
      mergeTemplate(
        template.id,
        rawTemplates.find((item) => item?.id === template.id) || null,
      ),
    ),
  };
}

export function getEmailMarketingTemplate(
  settings: EmailMarketingSettings,
  templateId: EmailMarketingTemplateId,
): EmailMarketingTemplate {
  return (
    settings.templates.find((template) => template.id === templateId) ||
    mergeTemplate(templateId)
  );
}

function interpolateValue(template: string, replacements: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => replacements[key] || "");
}

export function buildEmailTemplateVariables(recipient?: Partial<EmailMarketingRecipient>) {
  const firstName = String(recipient?.firstName || "").trim();
  const lastName = String(recipient?.lastName || "").trim();
  const email = String(recipient?.email || "").trim();

  return {
    firstName: firstName || "Musterimiz",
    lastName,
    email,
    storeName: STORE_RUNTIME.name,
    storeUrl: STORE_RUNTIME.storefrontUrl,
    productsUrl: buildStorefrontUrl("/urunler"),
    supportEmail: STORE_RUNTIME.supportEmail,
  };
}

export function renderEmailTemplate(
  template: Pick<EmailMarketingTemplate, "subject" | "bodyHtml">,
  recipient?: Partial<EmailMarketingRecipient>,
) {
  const variables = buildEmailTemplateVariables(recipient);
  const html = sanitizeTemplateHtml(interpolateValue(template.bodyHtml, variables));
  const subject = interpolateValue(template.subject, variables).trim();

  return {
    subject,
    html,
    text: extractPlainTextFromBlogContent(html),
  };
}
