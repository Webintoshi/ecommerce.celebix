export async function POST() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: "https://panel.celebix.site/login",
      "cache-control": "no-store",
      "set-cookie": `__Host-celebix_panel=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`,
    },
  });
}
