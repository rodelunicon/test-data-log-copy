# Accept ESP32 completed-log batches

## Goal
Let the existing machine-status endpoint accept the exact array the ESP32-CAM slave sends — pre-measured status sessions with durations — while keeping today's single-object, plain-text, form, and GET requests working unchanged.

## Request format (new)
```json
[
  {
    "machine": "MACHINE-01",
    "previous_status": "S",
    "new_status": "CM",
    "duration_seconds": 3600,
    "sequence": 14
  },
  {
    "machine": "MACHINE-01",
    "previous_status": "CM",
    "new_status": "R",
    "duration_seconds": 1800,
    "sequence": 15
  }
]
```

Each item is a **completed session**: the machine spent `duration_seconds` in `previous_status`, then switched to `new_status`. Items are ordered by `sequence` (ascending) so out-of-order arrays still replay correctly.

## How each batch is recorded
Working backwards from now, per machine:

1. Sort the machine's items by `sequence`.
2. Insert each completed session as a closed log row: `status = previous_status`, `duration_seconds` as given, `ended_at` chained so the last session ends at the moment the batch arrives, each earlier session ending when the next began. `started_at = ended_at - duration_seconds`.
3. After the last item, the machine's current open status becomes the last item's `new_status` (started now, no end time).
4. If a current open status exists before the batch, it is closed first (its duration measured up to the first batch item's start) so history never overlaps.

Validation per item:
- `machine` must exist; `previous_status` and `new_status` resolve through the existing status resolver (codes `S`/`CM`/…, full labels, or positions).
- `duration_seconds` must be a non-negative number; `sequence` a number.
- Duplicate `sequence` values within a batch for the same machine are rejected.
- Batches are capped (e.g. 50 items); invalid items return a 400 listing which item failed and why — nothing half-written per machine.

## Response
```json
{
  "ok": true,
  "accepted": 2,
  "machines": {
    "MACHINE-01": { "logged": 2, "current": "R - Running", "lastSequence": 15 }
  }
}
```

## Unchanged behavior
- Single object `{"status":"R","machine":"MACHINE-01"}`, plain text, form bodies, and GET `?status=` keep working exactly as now.
- No database changes — the existing log table already stores status, start/end, and duration.
- Dashboard, logs, and summary chart pick up the inserted sessions automatically.

## Technical details
- `src/routes/api/public/machine-status.ts`: detect a JSON array body and route to a new batch handler; keep the existing single-object path untouched.
- `src/lib/machine-status.server.ts`: add `writeSessionBatch(items)` using the existing machine lookup and `resolveStatusLabel`; per-machine grouping, sequence sort, chained timestamps, open-status closing, then a single read-back per machine for the response.
- Verify with a Postman-style two-item batch, confirm durations 3600/1800 in history and current status `R`, then run the type check.
