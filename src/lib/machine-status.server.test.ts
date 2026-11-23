import assert from "node:assert/strict";
import test from "node:test";

import { getSummaryRange, summarizeLogs } from "./machine-status.server";

test("today summary is empty when there are no entries for the current day", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const logs = [
    {
      id: "a",
      machine_name: "MACHINE-02",
      status: "P2 - Lack of supply",
      started_at: "2026-09-05T12:00:00Z",
      ended_at: "2026-09-05T13:00:00Z",
      duration_seconds: 3600,
    },
    {
      id: "b",
      machine_name: "MACHINE-03",
      status: "S - Set up (New Run)",
      started_at: "2026-09-05T14:00:00Z",
      ended_at: "2026-09-05T15:00:00Z",
      duration_seconds: 3600,
    },
  ];

  const filtered = getSummaryRange(logs, "today", now);

  assert.deepEqual(filtered, []);
});

test("today summary counts the active machine session through now", () => {
  const now = new Date("2026-09-24T12:00:00Z").getTime();
  const activeLog = {
    id: "active",
    machine_name: "MACHINE-03",
    status: "S - Set up (New Run)",
    started_at: "2026-09-24T10:00:00Z",
    ended_at: null,
    duration_seconds: null,
  };

  const todayLogs = getSummaryRange([activeLog], "today", now);
  const summary = summarizeLogs(todayLogs, now);

  assert.deepEqual(summary.rows, [
    {
      key: "MACHINE-03",
      label: "MACHINE-03",
      totalSeconds: 7200,
      sessions: 1,
      parts: { "S - Set up (New Run)": 7200 },
    },
  ]);
});
