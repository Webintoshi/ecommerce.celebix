import { supabase } from "@/lib/supabase";
import { isStorefrontCustomerAuthMigrationRequired } from "@/lib/supabase-disconnect-readiness";

export async function getAuthenticatedUser() {
  if (isStorefrontCustomerAuthMigrationRequired()) {
    return null;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    return null;
  }
}
