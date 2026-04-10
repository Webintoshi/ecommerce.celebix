"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { createOwnerBrowserClient } from "@/lib/owner-supabase-browser";

type AuthMode = "login" | "register";

export function OwnerAuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nextPath = useMemo(() => sanitizeInternalRedirectPath(searchParams.get("next"), "/"), [searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      if (mode === "login") {
        const supabase = createOwnerBrowserClient();
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(payload.error || "Giris yapilamadi.");
          return;
        }

        const session = payload.session;
        if (!session?.access_token || !session?.refresh_token) {
          setError("Giris oturumu olusturulamadi.");
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        router.replace(nextPath);
        router.refresh();
        return;
      }

      const supabase = createOwnerBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      setNotice("Hesap olusturuldu. E-posta dogrulamasi aciksa maildeki linke tikla, sonra buradan giris yap.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="owner-auth-form">
      <div className="owner-auth-switch" role="tablist" aria-label="Giris modu secimi">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`owner-auth-switch-btn${mode === "login" ? " is-active" : ""}`}
          onClick={() => setMode("login")}
        >
          Giris Yap
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={`owner-auth-switch-btn${mode === "register" ? " is-active" : ""}`}
          onClick={() => setMode("register")}
        >
          Hesap Olustur
        </button>
      </div>

      {mode === "register" ? (
        <label className="owner-auth-field">
          <span>Ad Soyad</span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Celebix Yonetici"
          />
        </label>
      ) : null}

      <label className="owner-auth-field">
        <span>E-posta</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="yonetici@celebix.com"
          required
        />
      </label>

      <label className="owner-auth-field">
        <span>Sifre</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="En az 8 karakter"
          minLength={8}
          required
        />
      </label>

      {error ? <p className="owner-auth-message is-error">{error}</p> : null}
      {notice ? <p className="owner-auth-message is-notice">{notice}</p> : null}

      <button type="submit" disabled={isPending} className="button button-primary owner-auth-submit">
        {isPending ? "Isleniyor..." : mode === "login" ? "Panel'e Giris Yap" : "Owner Hesabi Olustur"}
      </button>
    </form>
  );
}
