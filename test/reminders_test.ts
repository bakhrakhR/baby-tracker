// ============================================================================
// Unit tests for send-reminders decision logic
// (supabase/functions/send-reminders/logic.ts). Run: npm run test:functions
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hmToMinutes,
  isQuiet,
  localMinutes,
  feedingReminderDue,
  elapsedLabel,
} from "../supabase/functions/send-reminders/logic.ts";

test("hmToMinutes parses HH:MM and Postgres HH:MM:SS", () => {
  assert.equal(hmToMinutes("23:00"), 1380);
  assert.equal(hmToMinutes("07:30:00"), 450);
  assert.equal(hmToMinutes("00:00"), 0);
});

test("isQuiet handles same-day and overnight windows", () => {
  // same-day window 13:00–15:00
  assert.equal(isQuiet(hmToMinutes("14:00"), hmToMinutes("13:00"), hmToMinutes("15:00")), true);
  assert.equal(isQuiet(hmToMinutes("15:00"), hmToMinutes("13:00"), hmToMinutes("15:00")), false);
  // overnight window 23:00–07:00
  const from = hmToMinutes("23:00");
  const to = hmToMinutes("07:00");
  assert.equal(isQuiet(hmToMinutes("23:30"), from, to), true);
  assert.equal(isQuiet(hmToMinutes("03:00"), from, to), true);
  assert.equal(isQuiet(hmToMinutes("06:59"), from, to), true);
  assert.equal(isQuiet(hmToMinutes("07:00"), from, to), false);
  assert.equal(isQuiet(hmToMinutes("12:00"), from, to), false);
  // degenerate window means "no quiet hours"
  assert.equal(isQuiet(hmToMinutes("12:00"), from, from), false);
});

test("localMinutes converts to the given time zone", () => {
  // 2026-01-15T12:00:00Z is 14:00 in Asia/Jerusalem (UTC+2, winter time)
  const d = new Date("2026-01-15T12:00:00Z");
  assert.equal(localMinutes(d, "Asia/Jerusalem"), 14 * 60);
  assert.equal(localMinutes(d, "UTC"), 12 * 60);
});

const TZ = "UTC"; // tests reason in UTC to stay DST-proof
const at = (iso: string) => new Date(iso);

test("feeding reminder fires when the interval has passed", () => {
  assert.equal(
    feedingReminderDue({
      now: at("2026-07-18T12:00:00Z"),
      lastFedAt: at("2026-07-18T08:30:00Z"),
      intervalMinutes: 180,
      lastNotifiedAt: null,
      quietFrom: null,
      quietTo: null,
      timeZone: TZ,
    }),
    true,
  );
});

test("feeding reminder stays silent before the interval elapses", () => {
  assert.equal(
    feedingReminderDue({
      now: at("2026-07-18T10:00:00Z"),
      lastFedAt: at("2026-07-18T08:30:00Z"),
      intervalMinutes: 180,
      lastNotifiedAt: null,
      quietFrom: null,
      quietTo: null,
      timeZone: TZ,
    }),
    false,
  );
});

test("feeding reminder pings once per feeding", () => {
  const base = {
    now: at("2026-07-18T12:00:00Z"),
    lastFedAt: at("2026-07-18T08:30:00Z"),
    intervalMinutes: 180,
    quietFrom: null,
    quietTo: null,
    timeZone: TZ,
  };
  // already notified for this feeding → no repeat
  assert.equal(
    feedingReminderDue({ ...base, lastNotifiedAt: at("2026-07-18T11:35:00Z") }),
    false,
  );
  // a newer feeding resets the clock: old notification doesn't block
  assert.equal(
    feedingReminderDue({
      ...base,
      lastFedAt: at("2026-07-18T08:30:00Z"),
      lastNotifiedAt: at("2026-07-18T05:00:00Z"),
    }),
    true,
  );
});

test("quiet hours suppress the reminder, including overnight", () => {
  const base = {
    lastFedAt: at("2026-07-18T20:00:00Z"),
    intervalMinutes: 120,
    lastNotifiedAt: null,
    quietFrom: "23:00",
    quietTo: "07:00",
    timeZone: TZ,
  };
  // due at 22:00 → sendable before quiet hours
  assert.equal(feedingReminderDue({ ...base, now: at("2026-07-18T22:30:00Z") }), true);
  // 23:30 → inside quiet window
  assert.equal(feedingReminderDue({ ...base, now: at("2026-07-18T23:30:00Z") }), false);
  // 03:00 next day → still quiet
  assert.equal(feedingReminderDue({ ...base, now: at("2026-07-19T03:00:00Z") }), false);
  // 07:05 → quiet over, reminder finally goes out
  assert.equal(feedingReminderDue({ ...base, now: at("2026-07-19T07:05:00Z") }), true);
});

test("no feedings yet → nothing to remind about", () => {
  assert.equal(
    feedingReminderDue({
      now: at("2026-07-18T12:00:00Z"),
      lastFedAt: null,
      intervalMinutes: 180,
      lastNotifiedAt: null,
      quietFrom: null,
      quietTo: null,
      timeZone: TZ,
    }),
    false,
  );
});

test("elapsedLabel formats hours and minutes", () => {
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T09:15:00Z")), "45 мин");
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T11:45:00Z")), "3 ч 15 мин");
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T10:30:00Z")), "2 ч");
});
