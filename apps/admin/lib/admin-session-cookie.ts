import { createClient, type User } from "@supabase/supabase-js";
import { stringFromBase64URL } from "@supabase/ssr/dist/main/utils";
import { getSupabaseAnonKey, getSupabaseAuthStorageKey, getSupabaseServerUrl } from "@/lib/supabase-shared";

type CookieValue = {
  name: string;
  value: string;
};

type SessionCookiePayload = {
  access_token?: string;
};

function readChunkedCookieValue(cookies: CookieValue[], cookieName: string): string | null {
  const directCookie = cookies.find((cookie) => cookie.name === cookieName)?.value;
  if (directCookie) {
    return directCookie;
  }

  const chunks: string[] = [];

  for (let index = 0; ; index += 1) {
    const chunkValue = cookies.find((cookie) => cookie.name === `${cookieName}.${index}`)?.value;
    if (!chunkValue) {
      break;
    }

    chunks.push(chunkValue);
  }

  return chunks.length > 0 ? chunks.join("") : null;
}

export function readSupabaseSessionCookie(cookies: CookieValue[]): SessionCookiePayload | null {
  const encodedValue = readChunkedCookieValue(cookies, getSupabaseAuthStorageKey());
  if (!encodedValue) {
    return null;
  }

  try {
    const decodedValue = encodedValue.startsWith("base64-")
      ? stringFromBase64URL(encodedValue.slice("base64-".length))
      : encodedValue;

    return JSON.parse(decodedValue) as SessionCookiePayload;
  } catch {
    return null;
  }
}

export async function getSessionUserFromCookies(cookies: CookieValue[]): Promise<User | null> {
  const session = readSupabaseSessionCookie(cookies);

  if (!session?.access_token) {
    return null;
  }

  const supabase = createClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(session.access_token);

  if (error || !user) {
    return null;
  }

  return user;
}
