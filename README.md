# Machine Status Logger

CREATE A DATA LOGGING WEBSITE FOR MACHINE STATUSES WITH BACKEND ROUTES. LETS CREATE 2 STATUS ONLY FOR ONE MACHINE IT SHOULD LOG THE STATUS AND TIME SPENT ON EACH STATUSES.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://test-data-log.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/739947f7-7114-4988-b271-5ceb43d146b2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Sending a status transition

`POST /api/public/machine-status` accepts a transition body with the new current status and,
when available, the completed previous status:

```json
{
  "machine": "MACHINE-01",
  "current_status": "O2",
  "previous_status": "O1",
  "previous_started_at": "2026-10-03T10:00:00.000Z",
  "previous_ended_at": "2026-10-03T11:00:00.000Z",
  "previous_duration_seconds": 3600
}
```

The current status is stored for the machine card and does not create a log row. The previous
status and its completed session details are stored in the log. For the machine's first status,
send `"previous_status": null` and omit the previous-session fields. Existing requests using
`"status"` remain supported.

For batched transitions, keep the `logs` array format. Each item's `previous_status` and session
timestamps/duration are written to history; `new_status` updates the machine's current status.
The highest-sequence item's `new_status` is the final status shown on the machine card:

```json
{
  "logs": [
    {
      "machine": "MACHINE-03",
      "previous_status": "CM",
      "new_status": "O2",
      "duration_seconds": 60,
      "sequence": 101,
      "started_at": "2026-09-30T09:11:23+08:00",
      "ended_at": "2026-09-30T09:12:23+08:00"
    }
  ]
}
```

Older batch items without `previous_status` continue to log `new_status` for compatibility.

## Custom machine statuses

When adding a custom status while creating or editing a machine, use the format `code - name`,
for example `T - Testing`. Preset statuses already follow this format. Existing custom labels
saved before this validation was added remain unchanged unless you replace them.

Editing a machine's selected statuses does not rename existing labels or rewrite historical logs.
Removing a status removes it from the machine's available statuses, while past log entries keep
their original labels. Device position numbers refer to the current selected-status order and can
change when statuses are added or removed; use a status code or full label for a stable mapping.
