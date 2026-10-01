"use client";

import { useEffect, useRef, useState } from "react";

import { PHONE_COUNTRIES, composePhoneNumber, splitPhoneNumber } from "../lib/checkout-phone.ts";

export type CheckoutPhoneFieldProps = Readonly<{
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}>;

export function CheckoutPhoneField({ id, name = "phone", value, onChange, invalid, describedBy }: CheckoutPhoneFieldProps) {
  const [entry, setEntry] = useState(() => splitPhoneNumber(value));
  const emittedValue = useRef(value);

  useEffect(() => {
    if (value !== emittedValue.current) {
      emittedValue.current = value;
      setEntry(splitPhoneNumber(value));
    }
  }, [value]);

  const emit = (nextCountry: string, nationalNumber: string) => {
    const nextValue = composePhoneNumber(nextCountry, nationalNumber);
    emittedValue.current = nextValue;
    onChange(nextValue);
  };
  const isInternationalEntry = entry.nationalNumber.startsWith("+");

  return (
    <div className="checkout-phone-field" data-invalid={invalid ? "true" : undefined}>
      <select
        id={`${id}-country`}
        className="checkout-phone-country"
        aria-label="Telefon ülke kodu"
        title={`${entry.country.name} (${entry.country.dialCode})`}
        value={isInternationalEntry ? "international" : entry.country.country}
        onChange={(event) => {
          const country = PHONE_COUNTRIES.find((item) => item.country === event.target.value);
          if (!country) return;
          // An unsupported/non-geographic international prefill stays visible until edited.
          const nationalNumber = isInternationalEntry ? "" : entry.nationalNumber;
          setEntry({ country, nationalNumber });
          emit(country.country, nationalNumber);
        }}
      >
        {isInternationalEntry ? <option value="international" disabled>🌐 Uluslararası</option> : null}
        {PHONE_COUNTRIES.map((country) => (
          <option
            key={country.country}
            value={country.country}
            label={country.country === entry.country.country ? `${country.flag} ${country.dialCode}` : undefined}
          >{country.flag} {country.dialCode} {country.name}</option>
        ))}
      </select>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required
        maxLength={30}
        placeholder={entry.country.country === "TR" ? "555 111 22 33" : "Telefon numarası"}
        value={entry.nationalNumber}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.target.value;
          if (next.startsWith("+") || next.startsWith("00")) {
            const split = splitPhoneNumber(next, entry.country.country);
            setEntry(split);
            emit(split.country.country, next);
          } else {
            setEntry({ country: entry.country, nationalNumber: next });
            emit(entry.country.country, next);
          }
        }}
      />
    </div>
  );
}
