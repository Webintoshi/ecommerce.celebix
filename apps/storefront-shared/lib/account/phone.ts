export function normalizeStorefrontAccountPhone(value: unknown): string {
  if (typeof value !== "string" || value.length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || !/^[+0-9 ()-]+$/u.test(value)) throw new TypeError("storefront_account_phone_invalid");
  let number = value.trim().replace(/[ ()-]/gu, "");
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  else if (/^0[2-5][0-9]{9}$/u.test(number)) number = `+90${number.slice(1)}`;
  else if (/^[2-5][0-9]{9}$/u.test(number)) number = `+90${number}`;
  else if (/^90[2-5][0-9]{9}$/u.test(number)) number = `+${number}`;
  if (!/^\+[1-9][0-9]{7,14}$/u.test(number) || number.startsWith("+90") && !/^\+90[2-5][0-9]{9}$/u.test(number)) throw new TypeError("storefront_account_phone_invalid");
  return number;
}
