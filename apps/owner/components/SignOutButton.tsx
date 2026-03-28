"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createOwnerBrowserClient } from "@/lib/owner-supabase-browser";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const supabase = createOwnerBrowserClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="button button-ghost"
      style={{ width: "100%", justifyContent: "flex-start" }}
      onClick={handleClick}
      disabled={isPending}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {isPending ? "Cikis..." : "Cikis yap"}
    </button>
  );
}
