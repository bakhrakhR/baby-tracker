// ============================================================================
// Unit test for Telegram initData verification (supabase/functions/
// auth-telegram/initdata.ts). Runs on Node's built-in test runner:
//
//   node --test test/initdata_test.ts
//
// Node 24 strips the TypeScript types natively; the module under test uses
// only Web Platform APIs (Web Crypto, URLSearchParams), so the same code path
// that runs on the Supabase Edge runtime is exercised here.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyInitData } from "../supabase/functions/auth-telegram/initdata.ts";

const BOT_TOKEN = "123456:TEST-bot-token-abcdef";

// Build a correctly-signed initData string the way Telegram does, so we test
// the verifier against an independently-computed signature.
function signInitData(
  fields: Record<string, string>,
  botToken = BOT_TOKEN,
): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

const NOW = 1_800_000_000; // fixed "current time" in unix seconds
const freshUser = JSON.stringify({ id: 200, first_name: "Mama" });

test("accepts a valid, fresh initData and extracts the user id", async () => {
  const initData = signInitData({
    auth_date: String(NOW - 60),
    query_id: "AAABBBCCC",
    user: freshUser,
  });

  const result = await verifyInitData(initData, BOT_TOKEN, { nowSeconds: NOW });
  assert.equal(result.tgId, 200);
  assert.equal(result.user.first_name, "Mama");
});

test("rejects initData signed with the wrong bot token", async () => {
  const initData = signInitData(
    { auth_date: String(NOW - 60), user: freshUser },
    "999999:WRONG-token",
  );

  await assert.rejects(
    () => verifyInitData(initData, BOT_TOKEN, { nowSeconds: NOW }),
    /signature check failed/,
  );
});

test("rejects a tampered field after signing", async () => {
  const initData = signInitData({
    auth_date: String(NOW - 60),
    user: freshUser,
  });
  // Flip the user id without re-signing.
  const tampered = initData.replace(
    encodeURIComponent(freshUser),
    encodeURIComponent(JSON.stringify({ id: 100, first_name: "Papa" })),
  );

  await assert.rejects(
    () => verifyInitData(tampered, BOT_TOKEN, { nowSeconds: NOW }),
    /signature check failed/,
  );
});

test("rejects an expired initData (older than maxAge)", async () => {
  const initData = signInitData({
    auth_date: String(NOW - 2 * 60 * 60), // 2h old
    user: freshUser,
  });

  await assert.rejects(
    () =>
      verifyInitData(initData, BOT_TOKEN, {
        nowSeconds: NOW,
        maxAgeSeconds: 60 * 60, // 1h window
      }),
    /expired/,
  );
});

test("rejects initData with no hash field", async () => {
  const params = new URLSearchParams({
    auth_date: String(NOW),
    user: freshUser,
  });
  await assert.rejects(
    () => verifyInitData(params.toString(), BOT_TOKEN, { nowSeconds: NOW }),
    /missing the hash field/,
  );
});
