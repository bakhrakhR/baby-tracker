// Shared CORS headers for browser-called Edge Functions.
//
// The Mini App is served from GitHub Pages (a different origin than
// *.supabase.co), so every response must carry CORS headers and the
// function must answer the preflight OPTIONS request.
//
// This endpoint authenticates via Telegram initData in the request body,
// not via cookies, so a wildcard origin is safe here.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
