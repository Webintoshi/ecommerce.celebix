import type { EmailConfig } from "@/types/notification";

type ResendSendInput = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export function formatResendFromAddress(config: Pick<EmailConfig, "senderName" | "senderEmail">) {
  const senderName = String(config.senderName || "").trim();
  const senderEmail = String(config.senderEmail || "").trim();

  if (!senderEmail) {
    throw new Error("Gonderen e-posta adresi zorunludur.");
  }

  return senderName ? `${senderName} <${senderEmail}>` : senderEmail;
}

export async function sendResendEmail(input: ResendSendInput) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        payload?.name ||
        "Resend istegi basarisiz oldu.",
    );
  }

  return payload;
}
