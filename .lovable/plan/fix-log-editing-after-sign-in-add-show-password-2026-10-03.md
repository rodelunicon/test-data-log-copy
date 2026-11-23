# Fix log editing after sign-in, add show-password

## What you'll get
- After signing in, the **Add missing entry** button and a pencil on each row show up. Both work inside the editor preview and on the published site.
- Clicking the pencil (or Add missing entry) opens a popup with Machine, Status, Started, Ended and an automatic Duration.
- After you save, the popup closes and the list refreshes right away. The new or edited row lands in its correct place, newest start time first. If it falls on another page, a short message tells you where it went.
- The sign-in popup gets an eye icon to show or hide the password. The change-login popup gets one too.

## Likely cause (to confirm first)
The sign-in is saved in a browser cookie set to "same-site only." The editor preview runs inside an embedded frame on another site, and browsers block that kind of cookie there. So sign-in reports success, but the page still treats you as signed out and the edit controls stay hidden. My local browser test wasn't embedded, which is why it passed there.

## Steps
1. Confirm the cause: sign in inside an embedded frame and check whether the session is kept.
2. Let the sign-in cookie work inside the embedded preview, keeping it secure and hidden from page scripts.
3. After sign-in, refresh the signed-in state and the log list right away so the edit controls appear without reloading.
4. Make sure the edit popup opens with the row's details already filled in and that the date/time boxes can be typed into. Run a full test: add one entry and edit one entry.
5. On save, refresh the log list. Rows are already ordered by start time on the website's side. Jump to the page that holds the saved row.
6. Add the eye show/hide button to every password box.

## Technical details
- `src/lib/editor.server.ts`: change the session cookie to `sameSite: "none"` with `secure: true` and `httpOnly`, so it is sent inside the cross-site preview iframe.
- `src/components/log-editor.tsx`: add a `PasswordInput` with an Eye/EyeOff toggle from lucide. After sign-in, invalidate the `["editor"]` and `["logs"]` queries. Stop the dialog's form from resetting on the 2-second log refresh.
- `src/routes/logs.tsx`: after save, invalidate `["logs"]`, find the saved row's index in the sorted list, and set the page to match.
- No database changes.
