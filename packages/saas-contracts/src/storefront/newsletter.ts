export type NewsletterSubscribeInput = Readonly<{
  email: string;
  consent: true;
}>;

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function invalid(): never {
  throw new TypeError("newsletter_subscribe_input_invalid");
}

export function parseNewsletterSubscribeInput(value: unknown): NewsletterSubscribeInput {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || !keys.includes("email") || !keys.includes("consent")) invalid();
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
  }
  const emailValue = descriptors.email?.value;
  const consentValue = descriptors.consent?.value;
  if (
    typeof emailValue !== "string"
    || emailValue !== emailValue.trim()
    || emailValue.length < 3
    || new TextEncoder().encode(emailValue).byteLength > 254
    || CONTROL.test(emailValue)
    || !EMAIL.test(emailValue)
    || consentValue !== true
  ) invalid();
  return Object.freeze({ email: emailValue.toLowerCase(), consent: true });
}
