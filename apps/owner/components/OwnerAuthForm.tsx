"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
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
  const nextPath = useMemo(() => searchParams.get("next") || "/", [searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const supabase = createOwnerBrowserClient();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        router.replace(nextPath);
        router.refresh();
        return;
      }

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

      setNotice("Hesap olusturuldu. E-posta dogrulamasi gerekiyorsa Supabase mail kutusunu kontrol et.");
    });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-mode-switch">
        <button
          type="button"
          className={mode === "login" ? "button button-primary" : "button button-secondary"}
          onClick={() => setMode("login")}
        >
          Giris yap
        </button>
        <button
          type="button"
          className={mode === "register" ? "button button-primary" : "button button-secondary"}
          onClick={() => setMode("register")}
        >
          Hesap olustur
        </button>
      </div>

      {mode === "register" ? (
        <label className="field">
          <span>Ad soyad</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Celebix Yonetici" />
        </label>
      ) : null}

      <label className="field">
        <span>E-posta</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="yonetici@celebix.com" required />
      </label>

      <label className="field">
        <span>Sifre</span>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" minLength={8} required />
      </label>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <button type="submit" className="button button-primary" disabled={isPending}>
        {isPending ? "Isleniyor..." : mode === "login" ? "Owner paneline gir" : "Owner hesabi ac"}
      </button>
    </form>
  );
}
