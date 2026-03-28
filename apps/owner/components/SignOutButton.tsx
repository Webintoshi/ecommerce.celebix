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
    <button type="button" className="button button-secondary" onClick={handleClick} disabled={isPending}>
      {isPending ? "Cikis..." : "Cikis yap"}
    </button>
  );
}
