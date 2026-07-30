export type AdminLoginErrorCode =
  | "provider_disabled"
  | "invalid_callback"
  | "token_exchange_failed"
  | "identity_lookup_failed"
  | "membership_unavailable"
  | "not_assigned"
  | "session_write_failed";

export type AdminLoginRecoveryAction = "retry" | "switch_account";

type AdminLoginErrorPresentation = {
  title: string;
  message: string;
  action: AdminLoginRecoveryAction;
};

const ADMIN_LOGIN_ERROR_PRESENTATIONS: Record<
  AdminLoginErrorCode,
  AdminLoginErrorPresentation
> = {
  provider_disabled: {
    title: "Giriş geçici olarak kullanılamıyor",
    message: "Bu mağazanın güvenli giriş bağlantısı henüz etkin değil. Lütfen daha sonra tekrar deneyin.",
    action: "retry",
  },
  invalid_callback: {
    title: "Giriş bağlantısının süresi doldu",
    message: "Güvenli giriş işlemini yeniden başlatarak tekrar deneyin.",
    action: "retry",
  },
  token_exchange_failed: {
    title: "Giriş tamamlanamadı",
    message: "Kimlik doğrulama servisi yanıt vermedi. Lütfen tekrar deneyin.",
    action: "retry",
  },
  identity_lookup_failed: {
    title: "Hesap bilgisi alınamadı",
    message: "Hesabınız doğrulandı ancak bilgileriniz alınamadı. Lütfen tekrar deneyin.",
    action: "retry",
  },
  membership_unavailable: {
    title: "Mağaza yetkileri kontrol edilemiyor",
    message: "Mağaza yetki servisi geçici olarak kullanılamıyor. Lütfen biraz sonra tekrar deneyin.",
    action: "retry",
  },
  not_assigned: {
    title: "Bu mağaza için erişim yetkiniz yok",
    message: "Farklı bir hesapla giriş yapın veya mağaza sahibinden hesabınıza yetki vermesini isteyin.",
    action: "switch_account",
  },
  session_write_failed: {
    title: "Güvenli oturum oluşturulamadı",
    message: "Giriş bilgileri doğrulandı ancak oturum başlatılamadı. Lütfen tekrar deneyin.",
    action: "retry",
  },
};

const ADMIN_LOGIN_ERROR_CODES = new Set<AdminLoginErrorCode>(
  Object.keys(ADMIN_LOGIN_ERROR_PRESENTATIONS) as AdminLoginErrorCode[],
);

export function parseAdminLoginErrorCode(value: string | null): AdminLoginErrorCode | null {
  return value && ADMIN_LOGIN_ERROR_CODES.has(value as AdminLoginErrorCode)
    ? (value as AdminLoginErrorCode)
    : null;
}

export function getAdminLoginErrorPresentation(
  code: AdminLoginErrorCode,
): AdminLoginErrorPresentation {
  return ADMIN_LOGIN_ERROR_PRESENTATIONS[code];
}

function sanitizeAdminNextPath(nextPath: string): string {
  const normalized = nextPath.trim();
  return normalized.startsWith("/") && !normalized.startsWith("//")
    ? normalized
    : "/admin";
}

export function buildAdminSignInPath(
  nextPath: string,
  options?: { forceAccountSelection?: boolean },
): string {
  const searchParams = new URLSearchParams({
    next: sanitizeAdminNextPath(nextPath),
  });

  if (options?.forceAccountSelection) {
    searchParams.set("force_account", "1");
  }

  return `/api/auth/sign-in?${searchParams.toString()}`;
}
