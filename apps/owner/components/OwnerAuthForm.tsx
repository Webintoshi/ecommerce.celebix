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

      setNotice("Hesap olusturuldu. E-posta dogrulamasi aciksa maildeki linke tikla, sonra buradan giris yap.");
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Mode Switch */}
      <div style={{ 
        display: "flex", 
        gap: "8px", 
        padding: "4px",
        background: "var(--gray-100)",
        borderRadius: "10px"
      }}>
        <button
          type="button"
          onClick={() => setMode("login")}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
            background: mode === "login" ? "var(--white)" : "transparent",
            color: mode === "login" ? "var(--gray-800)" : "var(--gray-500)",
            boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
          }}
        >
          Giris Yap
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
            background: mode === "register" ? "var(--white)" : "transparent",
            color: mode === "register" ? "var(--gray-800)" : "var(--gray-500)",
            boxShadow: mode === "register" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
          }}
        >
          Hesap Olustur
        </button>
      </div>

      {/* Full Name - Only for register */}
      {mode === "register" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ 
            fontSize: "11px", 
            fontWeight: 700, 
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--gray-600)"
          }}>
            Ad Soyad
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Celebix Yonetici"
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid var(--gray-200)",
              fontSize: "14px",
              fontWeight: 500,
              background: "var(--white)",
              color: "var(--gray-800)",
              outline: "none",
              transition: "all 0.15s ease"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#EB651E";
              e.target.style.boxShadow = "0 0 0 3px rgba(235, 101, 30, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--gray-200)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      ) : null}

      {/* Email */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={{ 
          fontSize: "11px", 
          fontWeight: 700, 
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--gray-600)"
        }}>
          E-posta
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="yonetici@celebix.com"
          required
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid var(--gray-200)",
            fontSize: "14px",
            fontWeight: 500,
            background: "var(--white)",
            color: "var(--gray-800)",
            outline: "none",
            transition: "all 0.15s ease"
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#EB651E";
            e.target.style.boxShadow = "0 0 0 3px rgba(235, 101, 30, 0.1)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--gray-200)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {/* Password */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={{ 
          fontSize: "11px", 
          fontWeight: 700, 
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--gray-600)"
        }}>
          Sifre
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          minLength={8}
          required
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            border: "1px solid var(--gray-200)",
            fontSize: "14px",
            fontWeight: 500,
            background: "var(--white)",
            color: "var(--gray-800)",
            outline: "none",
            transition: "all 0.15s ease"
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "#EB651E";
            e.target.style.boxShadow = "0 0 0 3px rgba(235, 101, 30, 0.1)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "var(--gray-200)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {/* Error / Notice */}
      {error ? (
        <p style={{ 
          margin: 0, 
          fontSize: "13px", 
          fontWeight: 600,
          color: "var(--error)",
          textAlign: "center"
        }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p style={{ 
          margin: 0, 
          fontSize: "13px", 
          fontWeight: 600,
          color: "var(--success)",
          textAlign: "center"
        }}>
          {notice}
        </p>
      ) : null}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        style={{
          marginTop: "8px",
          padding: "14px 24px",
          borderRadius: "10px",
          fontSize: "14px",
          fontWeight: 700,
          border: "none",
          cursor: isPending ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          background: "#EB651E",
          color: "#fff",
          opacity: isPending ? 0.7 : 1
        }}
        onMouseEnter={(e) => {
          if (!isPending) {
            e.currentTarget.style.background = "#D45616";
            e.currentTarget.style.transform = "translateY(-1px)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#EB651E";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        {isPending 
          ? "Isleniyor..." 
          : mode === "login" 
            ? "Panel'e Giris Yap" 
            : "Owner Hesabi Olustur"
        }
      </button>
    </form>
  );
}
