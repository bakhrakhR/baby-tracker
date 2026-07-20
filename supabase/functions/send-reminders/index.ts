// ============================================================================
// send-reminders — invoked by cron every ~5 minutes.
//
// Delivers two kinds of Telegram notifications:
//   1. One-off rows in `reminders` whose fire_at has passed (visits, custom).
//      recipients = [] means "all members with notifications enabled".
//   2. Interval feeding reminders: per feeding_reminder_settings, ping when
//      interval_minutes have passed since the last feeding, honoring quiet
//      hours, at most once per feeding. → logic.ts (unit-tested)
//
// Security: verify_jwt is off (cron calls it), so the function itself checks
// that the caller presents the service-role key (the Supabase Cron dashboard
// job does) or the optional CRON_SECRET header.
//
// Secrets: TELEGRAM_BOT_TOKEN (already set for auth-telegram).
// Optional: FAMILY_TZ (IANA zone for quiet hours, default Asia/Jerusalem),
//           CRON_SECRET (alternative auth for external schedulers).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import {
  feedingReminderStage,
  selectRecipients,
  elapsedLabel,
  FINAL_LEAD_MIN,
  type MemberLite,
} from "./logic.ts";

// Constant-time string comparison for secret checks (no early exit).
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// The caller must prove it's our scheduler, not a random visitor. Accepted:
//   - x-cron-secret matching CRON_SECRET (what pg_cron sends, via Vault), or
//   - the runtime's own service key (new sb_secret_... form), or
//   - a JWT signed with the project secret whose role is service_role
//     (the legacy service key — what `supabase` tooling and tests use).
async function isAuthorized(req: Request): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret && safeEqual(headerSecret, cronSecret)) return true;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const runtimeKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (runtimeKey && safeEqual(token, runtimeKey)) return true;

  const jwtSecret = Deno.env.get("APP_JWT_SECRET");
  if (!jwtSecret) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const payload = await verify(token, key);
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendTelegram(
  botToken: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.warn(`sendMessage to ${chatId} failed: ${res.status} ${await res.text()}`);
    }
    return res.ok;
  } catch (err) {
    console.warn(`sendMessage to ${chatId} threw:`, (err as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const familyTz = Deno.env.get("FAMILY_TZ") ?? "Asia/Jerusalem";
  if (!serviceKey || !botToken || !supabaseUrl) {
    console.error("Missing required environment configuration");
    return json({ error: "server_misconfigured" }, 500);
  }

  if (!(await isAuthorized(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const now = new Date();
  const summary = { oneoff_sent: 0, feeding_sent: 0, errors: 0 };

  // --- recipients: editors/admins with notifications on (never guests) ------
  const { data: members, error: mErr } = await db
    .from("members")
    .select("telegram_id, role, notifications_enabled");
  if (mErr) {
    console.error("members query failed:", mErr.message);
    return json({ error: "db_error" }, 500);
  }
  const roster = (members ?? []) as MemberLite[];

  // --- 1. one-off reminders -------------------------------------------------
  const { data: due, error: rErr } = await db
    .from("reminders")
    .select("id, kind, message, recipients")
    .is("sent_at", null)
    .lte("fire_at", now.toISOString())
    .limit(50);
  if (rErr) console.error("reminders query failed:", rErr.message);

  for (const r of due ?? []) {
    const targets = selectRecipients(
      roster,
      (r.recipients as number[]) ?? [],
      r.kind === "photo" ? "guests" : "parents",
    );
    let ok = 0;
    for (const chatId of targets) {
      if (await sendTelegram(botToken, chatId, r.message as string)) ok += 1;
      else summary.errors += 1;
    }
    // Mark sent even on partial failure: a retry loop that re-pings everyone
    // every 5 minutes is worse than one missed DM (visible in the logs).
    const { error } = await db
      .from("reminders")
      .update({ sent_at: now.toISOString() })
      .eq("id", r.id);
    if (error) console.error("mark sent failed:", error.message);
    else summary.oneoff_sent += ok > 0 ? 1 : 0;
  }

  // --- 2. interval feeding reminders ---------------------------------------
  const { data: settings, error: sErr } = await db
    .from("feeding_reminder_settings")
    .select("child_id, interval_minutes, quiet_from, quiet_to, last_notified_at, last_notified_stage, early_reminder")
    .eq("enabled", true);
  if (sErr) console.error("settings query failed:", sErr.message);

  for (const s of settings ?? []) {
    const { data: lastFeed } = await db
      .from("feedings")
      .select("fed_at")
      .eq("child_id", s.child_id)
      .order("fed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastFedAt = lastFeed ? new Date(lastFeed.fed_at as string) : null;
    const stage = feedingReminderStage({
      now,
      lastFedAt,
      intervalMinutes: s.interval_minutes as number,
      lastNotifiedAt: s.last_notified_at ? new Date(s.last_notified_at as string) : null,
      quietFrom: s.quiet_from as string | null,
      quietTo: s.quiet_to as string | null,
      timeZone: familyTz,
      earlyEnabled: (s.early_reminder as boolean | null) ?? true,
      lastNotifiedStage: (s.last_notified_stage as number | null) ?? 0,
    });
    if (stage === 0 || !lastFedAt) continue;

    const dueAt = new Date(
      lastFedAt.getTime() + (s.interval_minutes as number) * 60_000,
    );
    let text: string;
    if (stage === 1) {
      text = `🍼 Раннее уведомление: до кормления полчаса · 1/2`;
    } else if (now.getTime() < dueAt.getTime()) {
      text = `🍼 До кормления ${FINAL_LEAD_MIN} минут · 2/2`;
    } else {
      // the final stage caught up after quiet hours or downtime — be direct
      text = `🍼 Пора кормить: с последнего кормления прошло ${elapsedLabel(lastFedAt, now)} · 2/2`;
    }
    let ok = 0;
    for (const chatId of selectRecipients(roster, [])) {
      if (await sendTelegram(botToken, chatId, text)) ok += 1;
      else summary.errors += 1;
    }
    // Only consume the stage when at least one DM went out — a total send
    // failure (Telegram outage) must retry on the next tick, not silently
    // swallow the safety-net reminder.
    if (ok > 0) {
      const { error } = await db
        .from("feeding_reminder_settings")
        .update({ last_notified_at: now.toISOString(), last_notified_stage: stage })
        .eq("child_id", s.child_id);
      if (error) console.error("mark notified failed:", error.message);
      else summary.feeding_sent += 1;
    }
  }

  return json({ ok: true, ...summary });
});
