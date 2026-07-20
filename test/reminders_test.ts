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
  feedingReminderStage,
  selectRecipients,
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

// Feeding at 08:30, interval 180 → due 11:30, early (1/2) at 11:00,
// final (2/2) at 11:25.
const base = {
  lastFedAt: at("2026-07-18T08:30:00Z"),
  intervalMinutes: 180,
  lastNotifiedAt: null,
  lastNotifiedStage: 0,
  quietFrom: null,
  quietTo: null,
  timeZone: TZ,
  earlyEnabled: true,
};

test("silent before the early window opens", () => {
  assert.equal(feedingReminderStage({ ...base, now: at("2026-07-18T10:59:00Z") }), 0);
});

test("early heads-up (1/2) fires 30 minutes before due", () => {
  assert.equal(feedingReminderStage({ ...base, now: at("2026-07-18T11:05:00Z") }), 1);
});

test("early stage sends only once", () => {
  assert.equal(
    feedingReminderStage({
      ...base,
      now: at("2026-07-18T11:10:00Z"),
      lastNotifiedAt: at("2026-07-18T11:05:00Z"),
      lastNotifiedStage: 1,
    }),
    0,
  );
});

test("final call (2/2) fires 5 minutes before due, after the early one", () => {
  assert.equal(
    feedingReminderStage({
      ...base,
      now: at("2026-07-18T11:26:00Z"),
      lastNotifiedAt: at("2026-07-18T11:05:00Z"), // 1/2 already sent
      lastNotifiedStage: 1,
    }),
    2,
  );
});

test("final stage sends only once", () => {
  assert.equal(
    feedingReminderStage({
      ...base,
      now: at("2026-07-18T11:40:00Z"),
      lastNotifiedAt: at("2026-07-18T11:26:00Z"), // 2/2 already sent
      lastNotifiedStage: 2,
    }),
    0,
  );
});

test("a missed cycle sends only the final stage, never a stale early one", () => {
  // nothing sent, now already past due → straight to 2/2
  assert.equal(feedingReminderStage({ ...base, now: at("2026-07-18T12:30:00Z") }), 2);
});

test("a newer feeding resets the cycle", () => {
  assert.equal(
    feedingReminderStage({
      ...base,
      now: at("2026-07-18T11:05:00Z"),
      lastNotifiedAt: at("2026-07-18T05:00:00Z"), // sent for a previous feeding
      lastNotifiedStage: 2,
    }),
    1,
  );
});

test("quiet hours suppress both stages, then the final catches up", () => {
  const q = {
    ...base,
    lastFedAt: at("2026-07-18T20:00:00Z"),
    intervalMinutes: 120, // due 22:00, early 21:30, final 21:55
    quietFrom: "21:00",
    quietTo: "07:00",
  };
  assert.equal(feedingReminderStage({ ...q, now: at("2026-07-18T21:35:00Z") }), 0);
  assert.equal(feedingReminderStage({ ...q, now: at("2026-07-18T23:30:00Z") }), 0);
  assert.equal(feedingReminderStage({ ...q, now: at("2026-07-19T07:05:00Z") }), 2);
});

test("no feedings yet → nothing to remind about", () => {
  assert.equal(
    feedingReminderStage({ ...base, lastFedAt: null, now: at("2026-07-18T12:00:00Z") }),
    0,
  );
});

test("disabling the early stage skips 1/2 but keeps the final call", () => {
  const off = { ...base, earlyEnabled: false };
  // inside the early window → silent
  assert.equal(feedingReminderStage({ ...off, now: at("2026-07-18T11:05:00Z") }), 0);
  // final window → 2/2 fires as usual
  assert.equal(feedingReminderStage({ ...off, now: at("2026-07-18T11:26:00Z") }), 2);
  // and only once
  assert.equal(
    feedingReminderStage({
      ...off,
      now: at("2026-07-18T11:40:00Z"),
      lastNotifiedAt: at("2026-07-18T11:26:00Z"),
      lastNotifiedStage: 2,
    }),
    0,
  );
});

test("editing the feeding's time between stages does not swallow the final call", () => {
  // Feed 10:00, interval 180: 1/2 sent at 12:30 (stage recorded as 1). The
  // parent then corrects fed_at to 09:30 → final threshold moves to 12:25,
  // BEFORE the recorded send time. The old timestamp inference read that as
  // "2/2 already sent"; the explicit stage says otherwise.
  assert.equal(
    feedingReminderStage({
      ...base,
      lastFedAt: at("2026-07-18T09:30:00Z"),
      now: at("2026-07-18T12:40:00Z"),
      lastNotifiedAt: at("2026-07-18T12:30:00Z"),
      lastNotifiedStage: 1,
    }),
    2,
  );
});

test("guests never receive reminders", () => {
  const family = [
    { telegram_id: 100, role: "admin", notifications_enabled: true },
    { telegram_id: 200, role: "editor", notifications_enabled: true },
    { telegram_id: 300, role: "guest", notifications_enabled: true }, // grandma
    { telegram_id: 400, role: "editor", notifications_enabled: false },
  ];
  // broadcast (empty explicit list): editors/admins with notifications on
  assert.deepEqual(selectRecipients(family, []), [100, 200]);
  // an explicitly listed guest is still excluded
  assert.deepEqual(selectRecipients(family, [200, 300]), [200]);
  // opted-out editor stays out even when listed
  assert.deepEqual(selectRecipients(family, [400]), []);
});

test("elapsedLabel formats hours and minutes", () => {
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T09:15:00Z")), "45 мин");
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T11:45:00Z")), "3 ч 15 мин");
  assert.equal(elapsedLabel(at("2026-07-18T08:30:00Z"), at("2026-07-18T10:30:00Z")), "2 ч");
});
