import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { createServerClient } from "@/lib/supabase";

export async function fetchCategoriesServer() {
  const supabase = createServerClient();

  const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  return data || [];
}
