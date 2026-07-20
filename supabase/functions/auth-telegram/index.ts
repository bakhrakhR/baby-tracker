// ============================================================================
// auth-telegram — exchanges Telegram Mini App `initData` for a Supabase JWT
//
// Flow:
//   1. The Mini App POSTs { initData } (the raw string from
//      window.Telegram.WebApp.initData).
//   2. We verify its HMAC signature against the bot token, per the Telegram
//      Web Apps spec, and reject stale payloads (replay protection).
//      → see ./initdata.ts (dependency-free, unit-tested)
//   3. We look up the Telegram user in the `members` whitelist (service role,
//      bypassing RLS).
//   4. If whitelisted, we mint a short-lived Supabase-compatible JWT signed
//      with the project's JWT secret, carrying the custom claims the RLS
//      helpers read: { role, app_role, tg_id }.
//
// Required secrets (set via `supabase secrets set` or the dashboard):
//   TELEGRAM_BOT_TOKEN  — the bot token from @BotFather
//   APP_JWT_SECRET      — the project's JWT secret (Settings → API → JWT)
//                         (named without the reserved SUPABASE_ prefix)
//
// Auto-provided by the Edge runtime:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyInitData, type VerifiedInitData } from "./initdata.ts";

// Lifetime of the JWT we issue. On expiry the client silently re-authenticates
// with the same (still-fresh) initData. Kept short so role changes and member
// removal take effect within minutes, not an hour (audit finding).
const JWT_TTL_SECONDS = 15 * 60; // 15 min

const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const jwtSecret = Deno.env.get("APP_JWT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !jwtSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Missing required environment configuration");
    return json({ error: "server_misconfigured" }, 500);
  }

  // --- parse body -----------------------------------------------------------
  let initData: string | undefined;
  try {
    const body = await req.json();
    initData = body?.initData;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!initData || typeof initData !== "string") {
    return json({ error: "missing_init_data" }, 400);
  }

  // --- verify Telegram signature -------------------------------------------
  let verified: VerifiedInitData;
  try {
    verified = await verifyInitData(initData, botToken);
  } catch (err) {
    console.warn("initData verification failed:", (err as Error).message);
    return json({ error: "invalid_init_data" }, 401);
  }

  // --- whitelist lookup (service role bypasses RLS) -------------------------
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: member, error: dbError } = await admin
    .from("members")
    .select("telegram_id, display_name, role")
    .eq("telegram_id", verified.tgId)
    .maybeSingle();

  if (dbError) {
    console.error("members lookup failed:", dbError.message);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!member) {
    // Known Telegram user, but not on the family whitelist.
    return json({ error: "not_a_member" }, 403);
  }

  // --- mint the Supabase-compatible JWT ------------------------------------
  const signingKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const token = await create(
    { alg: "HS256", typ: "JWT" },
    {
      // Supabase/PostgREST claims
      role: "authenticated",
      aud: "authenticated",
      sub: String(member.telegram_id),
      iat: getNumericDate(0),
      exp: getNumericDate(JWT_TTL_SECONDS),
      // custom claims read by the RLS helper functions
      app_role: member.role,
      tg_id: String(member.telegram_id),
    },
    signingKey,
  );

  return json({
    token,
    expires_in: JWT_TTL_SECONDS,
    member: {
      telegram_id: member.telegram_id,
      display_name: member.display_name,
      role: member.role,
    },
  });
});
