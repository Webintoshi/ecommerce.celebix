export async function GET() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "https://panel.celebix.site/login?auth=disabled",
      "cache-control": "no-store",
    },
  });
}
