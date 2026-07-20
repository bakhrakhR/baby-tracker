// ============================================================================
// Telegram Mini App initData verification.
//
// Kept dependency-free (only Web Platform APIs: Web Crypto, URLSearchParams,
// TextEncoder) so it runs unchanged on the Supabase Edge runtime (Deno) and
// under Node for unit tests.
//
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ============================================================================

const encoder = new TextEncoder();

// HMAC-SHA256(message) keyed by `key`, returning the raw bytes.
async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two hex strings, to avoid timing leaks.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifiedInitData {
  tgId: number;
  user: Record<string, unknown>;
  authDate: number;
}

export interface VerifyOptions {
  // Maximum accepted age of the initData payload, in seconds (replay guard).
  maxAgeSeconds?: number;
  // Current time in unix seconds; injectable for deterministic tests.
  nowSeconds?: number;
}

// Replay window: a captured initData string works as a credential until it
// expires, so keep this as short as real sessions allow. The webview refreshes
// initData on every open; 12h covers a long evening session while halving the
// old 24h exposure (audit finding).
const DEFAULT_MAX_AGE_SECONDS = 12 * 60 * 60; // 12h

/**
 * Verify a Telegram Mini App initData string and extract the user.
 * Throws Error with a stable message on any validation failure.
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  opts: VerifyOptions = {},
): Promise<VerifiedInitData> {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) throw new Error("initData is missing the hash field");
  params.delete("hash");

  // Data-check-string: remaining fields sorted by key, joined by "\n".
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  // signature = HMAC_SHA256(key=secret_key, message=data_check_string)
  const signature = toHex(await hmacSha256(secretKey, dataCheckString));

  if (!timingSafeEqual(signature, hash)) {
    throw new Error("initData signature check failed");
  }

  // Replay protection: reject payloads that are too old.
  const authDate = Number(params.get("auth_date") ?? "0");
  const maxAge = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > maxAge) {
    throw new Error("initData is expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("initData is missing the user field");
  const user = JSON.parse(userRaw) as Record<string, unknown>;
  const tgId = Number(user.id);
  if (!Number.isFinite(tgId)) throw new Error("initData user has no valid id");

  return { tgId, user, authDate };
}
