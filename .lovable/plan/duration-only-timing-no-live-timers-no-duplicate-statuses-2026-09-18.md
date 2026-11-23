# Duration-only timing, no live timers, no duplicate statuses

## Goal
The ESP32 is the only timekeeper: it sends `duration_seconds` per session and the website builds the timeline from those numbers. Remove all live-counting timers, and stop the duplicate/overlapping zero-second log rows.

## What changes

### 1. Dashboard cards — remove the ticking timer
- Each machine card keeps: machine name, status light, current status label, and the static "since 14:02:31" line.
- The big counting `hh:mm:ss` timer is removed; the dashboard refresh drops from 1 s to 2 s (nothing left to tick).

### 2. Machine detail page — remove the live "Elapsed in status" panel
- Keeps current status, "since" time, and the per-status total/average/entries cards (those come from logged durations, so they stay correct).

### 3. Logs page — active rows stop ticking
- An active row shows "active" in Duration instead of a counting number. Completed rows keep the ESP32-reported duration. CSV download matches.

### 4. Batch handling — trust the current status, not `previous_status`
Root cause of the duplicates in your screenshot: when a batch arrives, the website was writing a row for the batch's `previous_status` *and* repurposing the machine's open row. When the two disagreed, you got overlapping rows with 00:00:00 durations (the R, P1, CM, S zero-second rows at 04:38 PM).

New rule per batch item (processed in `sequence` order):
- The machine's **current open status** is the session being closed — it gets the item's `duration_seconds` and an end time computed from it. The item's `previous_status` field is still accepted (so your ESP32 sketch doesn't change) but no longer decides what gets logged.
- Then the item's `new_status` opens as the new current status — **unless it equals the status just closed**, in which case nothing new is written (no duplicate consecutive rows).
- If a machine has no open status (first-ever batch), the first item's `previous_status` is used once as a fallback so the session isn't lost.
- Start/end times are pure duration arithmetic, chained in sequence order, anchored at batch arrival — exactly how it works today, just without the row that caused overlaps.

Your ESP32 slave sketch needs **no changes** — the request format stays identical.

### 5. One-time cleanup of existing bad rows
Delete the existing zero-duration duplicate rows (rows where start = end, duration 0, and another row for the same machine begins at that same instant — the junk visible in your screenshot). Real zero-length sessions are not touched by future writes since rule 4 stops creating them.

## Files touched
- `src/lib/machine-status.server.ts` — rewrite `writeSessionBatch` per rule 4.
- `src/routes/index.tsx`, `src/routes/machine.$name.tsx`, `src/routes/logs.tsx` — remove timers (items 1–3).
- One migration — delete the existing duplicate zero-second rows.

## Unchanged
- Database schema, API request format, single-object POSTs, summary chart, averages.

## Verify
- Send your exact two-item ESP32 batch; confirm each session closes the previously-open status with the right duration, no zero-second duplicates appear, consecutive same-status items create nothing, and no timers count anywhere on the pages.
