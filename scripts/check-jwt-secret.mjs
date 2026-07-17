// ============================================================================
// Checks whether APP_JWT_SECRET is really the project's JWT secret.
//
// The project's legacy anon key is a JWT signed with that exact secret, so we
// can verify a candidate secret locally without any guessing. (anon keys are
// public by design — safe to embed.)
//
// Reads the candidate from the APP_JWT_SECRET env var, or from
// supabase/functions/.env if the env var is not set.
//
// Usage:
//   node scripts/check-jwt-secret.mjs
//   APP_JWT_SECRET='candidate' node scripts/check-jwt-secret.mjs
// ============================================================================

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

// Legacy anon key for project cggxyzkcwkhqsxyfqttb (public).
const ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ3h5emtjd2tocXN4eWZxdHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjYxMDMsImV4cCI6MjA5OTgwMjEwM30.O3oJtQPMyxiG-imx0idkdeWREn3NxdDWRDluIdKK9k0";

function loadSecret() {
  if (process.env.APP_JWT_SECRET) return process.env.APP_JWT_SECRET;
  try {
    const env = readFileSync(
      new URL("../supabase/functions/.env", import.meta.url),
      "utf8",
    );
    const m = env.match(/^\s*APP_JWT_SECRET\s*=\s*(.*)\s*$/m);
    if (m) return m[1].replace(/^['"]|['"]$/g, "").trim();
  } catch {
    /* fall through */
  }
  return null;
}

const secret = loadSecret();
if (!secret) {
  console.error(
    "APP_JWT_SECRET not found (set the env var or fill supabase/functions/.env).",
  );
  process.exit(1);
}

const [header, payload, signature] = ANON_JWT.split(".");
const expected = createHmac("sha256", secret)
  .update(`${header}.${payload}`)
  .digest("base64url");

if (expected === signature) {
  console.log("✅ MATCH — APP_JWT_SECRET is the correct project JWT secret.");
} else {
  console.log(
    "❌ NO MATCH — this is NOT the project's JWT secret.\n" +
      "   Copy the exact value from: Dashboard → Project Settings → API →\n" +
      "   JWT Keys → 'Legacy JWT Secret' (a ~40+ char random string, NOT the\n" +
      "   anon key 'eyJ...' and NOT the 'sb_publishable_...' key).",
  );
  process.exit(2);
}
