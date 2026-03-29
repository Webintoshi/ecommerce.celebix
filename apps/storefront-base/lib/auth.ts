import { supabase } from "@/lib/supabase";

export async function getAuthenticatedUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    return null;
  }
}
