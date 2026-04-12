"use client";

import { useEffect } from "react";
import { clearOwnerBrowserAuthArtifacts } from "@/lib/owner-supabase-browser";

export function OwnerAuthRecovery() {
  useEffect(() => {
    clearOwnerBrowserAuthArtifacts();
  }, []);

  return null;
}
