import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInvite, dayLabel, grantSummary, groupActivity, nextRun, scheduleText, timeAgo } from "./places.logic.ts";

// Tuesday 24 November 2026, 10:00 local time.
const now = new Date(2026, 10, 24, 10, 0).getTime();
const minutesAgo = (minutes: number) => now - minutes * 60_000;

test("times read like the phone's", () => {
  assert.equal(timeAgo(minutesAgo(0), now), "just now");
  assert.equal(timeAgo(minutesAgo(12), now), "12 min ago");
  assert.equal(timeAgo(minutesAgo(180), now), "3 h ago");
  assert.equal(timeAgo(minutesAgo(60 * 15), now), "yesterday");
  assert.equal(timeAgo(new Date(2026, 10, 12, 9).getTime(), now), "12 Nov");
  assert.equal(dayLabel(minutesAgo(30), now), "Today");
  assert.equal(dayLabel(minutesAgo(60 * 15), now), "Yesterday");
});

test("activity sits under its day, newest first, and filters", () => {
  const items = [
    { id: "a", at: minutesAgo(30), status: "done" as const },
    { id: "b", at: minutesAgo(5), status: "needsYou" as const },
    { id: "c", at: minutesAgo(60 * 15), status: "done" as const },
  ];
  assert.deepEqual(groupActivity(items, "all", now).map((group) => [group.day, group.items.map((item) => item.id)]), [["Today", ["b", "a"]], ["Yesterday", ["c"]]]);
  assert.deepEqual(groupActivity(items, "needsYou", now).flatMap((group) => group.items.map((item) => item.id)), ["b"]);
  assert.deepEqual(groupActivity(items, "done", now).flatMap((group) => group.items.map((item) => item.id)), ["a", "c"]);
});

test("a routine's schedule in words", () => {
  assert.equal(scheduleText([0, 1, 2, 3, 4, 5, 6], "7:00"), "Every day at 7:00");
  assert.equal(scheduleText([5, 1, 2, 3, 4], "7:00"), "Weekdays at 7:00");
  assert.equal(scheduleText([6, 0], "10:00"), "Weekends at 10:00");
  assert.equal(scheduleText([1], "9:30"), "Mondays at 9:30");
  assert.equal(scheduleText([1, 4], "9:30"), "Mondays and Thursdays at 9:30");
  assert.equal(scheduleText([], "9:30"), "Never");
});

test("the next run is the next matching day and time, and none when off", () => {
  assert.equal(nextRun([2], "11:00", true, now), new Date(2026, 10, 24, 11, 0).getTime(), "later today");
  assert.equal(nextRun([2], "9:00", true, now), new Date(2026, 11, 1, 9, 0).getTime(), "next Tuesday");
  assert.equal(nextRun([6], "18:00", true, now), new Date(2026, 10, 28, 18, 0).getTime(), "Saturday");
  assert.equal(nextRun([2], "11:00", false, now), null);
});

test("what a friend's mate may do, in one line", () => {
  assert.equal(grantSummary({ freeTime: false, updates: false, answers: false }), "Asks you before anything");
  assert.equal(grantSummary({ freeTime: true, updates: false, answers: false }), "Can see when you're free");
  assert.equal(grantSummary({ freeTime: true, updates: true, answers: true }), "Can see when you're free, pass on updates and get answers from your mate");
});

test("inviting by email catches the cases the phone does", () => {
  const people = { me: "ama@mates.app", friends: ["efua@mail.com"], asked: ["kojo@mail.com"], onMates: ["nana@mail.com"] };
  assert.equal(checkInvite("nope", people), "invalid");
  assert.equal(checkInvite("AMA@mates.app", people), "yourself");
  assert.equal(checkInvite("efua@mail.com", people), "friends");
  assert.equal(checkInvite("kojo@mail.com", people), "asked");
  assert.equal(checkInvite("nana@mail.com", people), "ok");
  assert.equal(checkInvite("someone@new.com", people), "notOnMates");
});
