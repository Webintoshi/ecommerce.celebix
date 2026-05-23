import { createClient, type User } from "@supabase/supabase-js";
import {
  getOptionalSupabaseAnonKey,
  getOptionalSupabaseAuthStorageKey,
  getOptionalSupabaseServerUrl,
  isLightPostgresAuthBlockedRuntime,
} from "@/lib/supabase-shared";
import { decodeSessionCookiePayload } from "@/lib/supabase-session-cookie-utils";

type CookieValue = {
  name: string;
  value: string;
};

type SessionCookiePayload = {
  access_token?: string;
  user?: User | null;
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
  if (isLightPostgresAuthBlockedRuntime()) {
    return null;
  }

  const cookieName = getOptionalSupabaseAuthStorageKey();

  if (!cookieName) {
    return null;
  }

  const encodedValue = readChunkedCookieValue(cookies, cookieName);
  if (!encodedValue) {
    return null;
  }

  try {
    return JSON.parse(decodeSessionCookiePayload(encodedValue)) as SessionCookiePayload;
  } catch {
    return null;
  }
}

export function readSessionUserSnapshotFromCookies(cookies: CookieValue[]): User | null {
  const session = readSupabaseSessionCookie(cookies);
  const user = session?.user;

  if (!user?.id) {
    return null;
  }

  return user;
}

export async function getSessionUserFromCookies(cookies: CookieValue[]): Promise<User | null> {
  if (isLightPostgresAuthBlockedRuntime()) {
    return null;
  }

  const session = readSupabaseSessionCookie(cookies);

  if (!session?.access_token) {
    return null;
  }

  const serverUrl = getOptionalSupabaseServerUrl();
  const anonKey = getOptionalSupabaseAnonKey();

  if (!serverUrl || !anonKey) {
    return null;
  }

  const supabase = createClient(serverUrl, anonKey, {
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
