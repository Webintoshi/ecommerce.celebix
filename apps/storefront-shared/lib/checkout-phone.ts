import { PHONE_COUNTRY_DATA } from "./phone-countries.ts";

export type PhoneCountry = Readonly<{
  country: string;
  name: string;
  dialCode: string;
  flag: string;
  nationalPrefix?: string;
  maximumNationalLength?: number;
}>;

export const PHONE_COUNTRIES: readonly PhoneCountry[] = Object.freeze(PHONE_COUNTRY_DATA.map((row) => {
  const [country, name, dialCode, nationalPrefix, maximumNationalLength] = row as readonly [string, string, string, string?, number?];
  return Object.freeze({
    country, name, dialCode,
    flag: String.fromCodePoint(...[...country].map((letter) => 127397 + letter.charCodeAt(0))),
    ...(nationalPrefix ? { nationalPrefix, maximumNationalLength } : {}),
  });
}));

const DEFAULT_COUNTRY = PHONE_COUNTRIES[0]!;
const COUNTRY_BY_ID = new Map(PHONE_COUNTRIES.map((country) => [country.country, country]));
// Official metadata mainCountryForCode: a number alone cannot distinguish every shared region.
// A prefilled +1 therefore selects US; a shopper's explicit CA/other selection is preserved.
const MAIN_REGIONS: Readonly<Record<string, string>> = Object.freeze({
  "+1": "US", "+7": "RU", "+39": "IT", "+44": "GB", "+47": "NO", "+61": "AU",
  "+212": "MA", "+262": "RE", "+290": "SH", "+358": "FI", "+590": "GP", "+599": "CW",
});
const PREFIX_COUNTRIES = [...PHONE_COUNTRIES].sort((left, right) => right.dialCode.length - left.dialCode.length);

function compactPhone(value: string): string {
  const compact = value.replace(/[ ()\u00a0.-]/gu, "");
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

export function isCanonicalPhoneNumber(value: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/u.test(value);
}

export function splitPhoneNumber(value: string, preferredCountry?: string): Readonly<{ country: PhoneCountry; nationalNumber: string }> {
  const compact = compactPhone(value);
  const preferred = preferredCountry ? COUNTRY_BY_ID.get(preferredCountry) : undefined;
  if (compact.startsWith("+")) {
    const match = PREFIX_COUNTRIES.find((country) => compact.startsWith(country.dialCode));
    if (match) {
      const country = preferred?.dialCode === match.dialCode ? preferred : COUNTRY_BY_ID.get(MAIN_REGIONS[match.dialCode] ?? match.country)!;
      return Object.freeze({ country, nationalNumber: compact.slice(country.dialCode.length) });
    }
    // Keep non-geographic or incomplete international numbers intact, including +870.
    return Object.freeze({ country: preferred ?? DEFAULT_COUNTRY, nationalNumber: compact });
  }
  return Object.freeze({ country: preferred ?? DEFAULT_COUNTRY, nationalNumber: compact });
}

export function composePhoneNumber(countryId: string, value: string): string {
  const country = COUNTRY_BY_ID.get(countryId) ?? DEFAULT_COUNTRY;
  let national = compactPhone(value);
  if (!national || national.startsWith("+")) return national;
  const dialDigits = country.dialCode.slice(1);
  const maximum = country.maximumNationalLength ?? 15 - dialDigits.length;
  if (national.startsWith(dialDigits) && national.length > maximum) national = national.slice(dialDigits.length);
  const prefix = country.nationalPrefix;
  if (prefix && national.startsWith(prefix) && (prefix.startsWith("0") || national.length > maximum)) national = national.slice(prefix.length);
  return national ? `${country.dialCode}${national}` : "";
}
