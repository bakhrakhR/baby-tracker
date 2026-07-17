// ============================================================================
// End-to-end smoke test for the deployed auth-telegram function.
//
// Generates a VALID Telegram initData string (signed locally with your bot
// token) and calls the live function, so it exercises the whole path:
// HMAC verification → members whitelist lookup → JWT minting.
//
// Your bot token never leaves your machine and is not printed.
//
// Usage (run in YOUR terminal):
//   TELEGRAM_BOT_TOKEN=123456:aa TG_ID=<your telegram id> \
//     node scripts/auth-smoke.mjs
//
// Optional: FUNCTION_URL=... to override the default endpoint.
// ============================================================================

import { createHmac } from "node:crypto";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_ID = process.env.TG_ID;
const FUNCTION_URL =
  process.env.FUNCTION_URL ??
  "https://cggxyzkcwkhqsxyfqttb.supabase.co/functions/v1/auth-telegram";

if (!BOT_TOKEN || !TG_ID) {
  console.error(
    "Set TELEGRAM_BOT_TOKEN and TG_ID env vars. Example:\n" +
      "  TELEGRAM_BOT_TOKEN=123:aa TG_ID=111111 node scripts/auth-smoke.mjs",
  );
  process.exit(1);
}

// Build a correctly-signed initData the way Telegram does.
function signInitData(fields, botToken) {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const initData = signInitData(
  {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "smoke-test",
    user: JSON.stringify({ id: Number(TG_ID), first_name: "SmokeTest" }),
  },
  BOT_TOKEN,
);

console.log(`POST ${FUNCTION_URL}  (tg_id=${TG_ID})`);
const res = await fetch(FUNCTION_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ initData }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
try {
  const body = JSON.parse(text);
  // Show the decoded JWT payload (not the signature) so you can eyeball claims.
  if (body.token) {
    const [, payload] = body.token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    console.log("member:", body.member);
    console.log("jwt claims:", claims);
    console.log("\n✅ auth-telegram works end-to-end.");
  } else {
    console.log("response:", body);
    if (res.status === 403) {
      console.log(
        "\nℹ️  403 not_a_member — the function works, but this TG_ID isn't in the members table yet.",
      );
    }
  }
} catch {
  console.log("raw response:", text);
}
