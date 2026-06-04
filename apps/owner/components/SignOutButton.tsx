"use client";

import { useTransition } from "react";
import { clearOwnerBrowserAuthArtifacts } from "@/lib/owner-supabase-browser";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      }).catch(() => undefined);
      clearOwnerBrowserAuthArtifacts();
      window.location.replace("/login");
    });
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="signout-button">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {isPending ? "Çıkış yapılıyor..." : "Çıkış yap"}
    </button>
  );
}
