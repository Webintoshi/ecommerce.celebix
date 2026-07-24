"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/session/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("logout_failed");
      location.assign("/login");
    } catch {
      setError("Çıkış tamamlanamadı. Lütfen yeniden deneyin.");
      setSubmitting(false);
    }
  }

  return (
    <div className="logout-control">
      <button className="logout-button" type="button" onClick={logout} disabled={submitting} aria-label={submitting ? "Çıkış yapılıyor" : "Güvenli çıkış yap"}>
        <LogOut aria-hidden="true" />
        <span className="logout-label">{submitting ? "Çıkış yapılıyor…" : "Çıkış"}</span>
      </button>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </div>
  );
}
