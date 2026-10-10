#!/usr/bin/env bash
# Run from your project root (the folder containing backend/ and frontend/):
#   bash check-webcall-files.sh
# Reports which web-call files are missing or out of date in YOUR project.
fail=0
chk() { # file  pattern  [label]
  if [ ! -f "$1" ]; then echo "❌ MISSING FILE  $1"; fail=1
  elif grep -q -- "$2" "$1"; then echo "✅ $1  ($2)"
  else echo "❌ OUTDATED      $1  (does not contain: $2)"; fail=1; fi
}
chk backend/src/controllers/webCallController.ts "export const startWebCall"
chk backend/src/controllers/webCallController.ts "export const attachWebCall"
chk backend/src/controllers/webCallController.ts "export const syncWebCall"
chk backend/src/controllers/webCallController.ts "EMAIL_RE"
chk backend/src/routes/calls.ts                  "web/start"
chk backend/src/controllers/webhookController.ts "findCallLogForEvent"
chk backend/src/controllers/webhookController.ts "export async function handleEndOfCallReport"
chk backend/src/controllers/webhookController.ts "isWebCall"
chk backend/src/models/CallLog.js                "channel"
chk backend/src/services/vapiService.ts          "buildWebCallOverrides"
chk backend/src/services/vapiService.ts          "getVapiCall"
chk backend/src/services/vapiService.ts          "CONDUCT_RULES"
chk backend/src/services/vapiService.ts          "slice(0, 40)"
chk backend/src/services/vapiService.ts          "leadEmail"
chk backend/src/services/googleCalendarService.ts "sendUpdates"
chk backend/src/services/googleCalendarService.ts "sanitizeReturnTo"
chk backend/src/controllers/meetingController.ts "inviteEmailedTo"
chk frontend/src/lib/api/webCall.ts              "inviteEmailedTo"
chk frontend/src/components/calls/WebCallPanel.tsx "transcriptBoxRef"
chk frontend/src/app/dashboard/calls/page.tsx    "WebCallPanel"
echo
if [ $fail -eq 0 ]; then echo "All web-call files are in place. Now run: cd backend && npx tsc --noEmit"; else echo "Fix the ❌ items above (replace those files from the zips I sent), then re-run."; fi